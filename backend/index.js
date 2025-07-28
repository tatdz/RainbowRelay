import crypto from 'crypto'
import dotenv from 'dotenv'
import express from 'express'
import JSONParser from 'jsonparse'

import { pipe } from 'it-pipe'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'

import { multiaddr } from '@multiformats/multiaddr'
import { LevelBlockstore } from 'blockstore-level'
import { createHelia } from 'helia'
import { createBitswap } from '@helia/bitswap'

import { CID } from 'multiformats/cid'
import { encode, decode } from 'multiformats/block'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

dotenv.config()

const PORT = process.env.PORT || 3000
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

const PROTOCOL = '/orders/1.0.0'
const FLASH_PROTOCOL = '/orders/flash/1.0.0'
const DARKPOOL_SUBSCRIPTIONS_PROTOCOL = '/darkpool/subscriptions/1.0.0'

const DARKPOOL_ANNOUNCE_TOPIC = 'darkpool/announce'

// Inactivity duration (ms) after which a pool is pruned if no new orders/activity
const POOL_INACTIVITY_PRUNE_MS = 1000 * 60 * 15 // e.g., 15 minutes

const app = express()
app.use(express.json())

let libp2pNode
let heliaNode
let bitswap
let ipfsOrdersCID = null
let ordersCache = []

const darkPools = {}
const knownPools = new Set()

const poolLastActivity = new Map() // poolName -> timestamp of last activity

const flashChannelStreams = new Map()

// Helper: Generate consistent order ID and timestamp
function generateOrderID(prefix = '') {
  // UTC timestamp in milliseconds + short random suffix (base36)
  return `${prefix}${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

/**
 * Update last activity timestamp for a pool
 * @param {string} poolName
 */
function updatePoolActivity(poolName) {
  if (!poolName) return
  poolLastActivity.set(poolName, Date.now())
}

function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()])
  return encrypted.toString('hex')
}

function decryptOrder(encryptedHex, key) {
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return JSON.parse(decrypted.toString())
}

function isPeerAuthorizedForPool(peerIdStr, poolName) {
  if (!darkPools[poolName]) return false
  return darkPools[poolName].has(peerIdStr)
}

async function onOrdersProtocol({ stream, connection }) {
  return new Promise((resolve) => {
    const parser = new JSONParser()
    let order = null

    parser.onValue = function (value) {
      if (this.stack.length === 0) order = value
    }
    parser.onError = function (err) {
      console.error('JSON parse error in orders stream:', err)
      resolve()
    }

    ;(async () => {
      try {
        for await (const chunk of stream.source) {
          let bufferToParse = typeof chunk.slice === 'function' ? chunk.slice() : chunk
          parser.write(Buffer.from(bufferToParse))
        }
      } catch (err) {
        console.error('Error reading orders stream:', err)
      } finally {
        try {
          if (order) {
            let decryptedOrder = order
            if (ENCRYPTION_KEY) {
              try {
                if (typeof order === 'string') {
                  decryptedOrder = decryptOrder(order, ENCRYPTION_KEY)
                } else if (order.encrypted && typeof order.data === 'string') {
                  decryptedOrder = decryptOrder(order.data, ENCRYPTION_KEY)
                }
              } catch {}
            }
            const hash = JSON.stringify(decryptedOrder)
            if (!ordersCache.some(o => JSON.stringify(o) === hash)) {
              ordersCache.push(decryptedOrder)
              console.log('📦 Received order via protocol:', decryptedOrder)

              // Update pool activity timestamp if available
              if (decryptedOrder.pool) updatePoolActivity(decryptedOrder.pool)

              notifyFlashChannels(decryptedOrder)
            }
          }
        } catch (finalErr) {
          console.error('Error processing parsed order:', finalErr)
        }
        resolve()
      }
    })()
  })
}

async function notifyFlashChannels(order) {
  const encoded = new TextEncoder().encode(JSON.stringify(order))
  for (const [peerId, stream] of flashChannelStreams.entries()) {
    try {
      if (stream && typeof stream.sink === 'function') {
        await pipe([encoded], stream.sink)
        console.log(`⚡ Sent flash notification to peer ${peerId}`)
      }
    } catch (err) {
      console.warn(`Failed to notify flash channel peer ${peerId}:`, err)
    }
  }
}

async function onFlashChannel({ stream, connection }) {
  const peerIdStr = connection.remotePeer.toString()
  console.log(`⚡ Flash channel stream opened from peer ${peerIdStr}`)
  flashChannelStreams.set(peerIdStr, stream)

  const heartbeatIntervalMs = 30000

  async function sendHeartbeat() {
    if (stream && typeof stream.sink === 'function') {
      try {
        await pipe([new TextEncoder().encode(JSON.stringify({ type: 'heartbeat' }))], stream.sink)
      } catch (err) {
        console.error(`Heartbeat send error to peer ${peerIdStr}:`, err)
      }
    }
  }
  const interval = setInterval(sendHeartbeat, heartbeatIntervalMs)

  try {
    for await (const msg of stream.source) {
      let bytes
      if (msg && typeof msg.subarray === 'function') {
        bytes = msg.subarray()
      } else if (msg instanceof Uint8Array) {
        bytes = msg
      } else {
        console.warn('⚠️ Received unexpected flash channel message format:', msg)
        continue
      }
      const decoded = new TextDecoder().decode(bytes)
      console.log(`⚡ Flash channel message received from ${peerIdStr}:`, decoded)
    }
  } catch (err) {
    console.error('Flash channel error:', err)
  } finally {
    clearInterval(interval)
    flashChannelStreams.delete(peerIdStr)
    console.log(`⚡ Flash channel stream closed for peer ${peerIdStr}`)
  }
}

async function ensureDarkPoolSubscription(poolName) {
  if (!poolName) return
  knownPools.add(poolName)
  const topic = `darkpool/${poolName}`
  const subscribedTopics = libp2pNode.services.pubsub.getTopics()
  if (!subscribedTopics.includes(topic)) {
    try {
      await libp2pNode.services.pubsub.subscribe(topic)
      console.log(`✅ Subscribed to dark pool topic: ${topic}`)
    } catch (err) {
      console.warn(`⚠️ Failed to subscribe to dark pool topic ${topic}:`, err)
    }
  }
}

async function announceKnownPools() {
  try {
    const poolsArray = Array.from(knownPools)
    if (poolsArray.length === 0) return
    const announcement = JSON.stringify({ pools: poolsArray })
    await libp2pNode.services.pubsub.publish(DARKPOOL_ANNOUNCE_TOPIC, new TextEncoder().encode(announcement))
    console.log(`📡 Announced known dark pools: ${poolsArray.join(', ')}`)
  } catch (err) {
    if (err.code !== 'ERR_NO_PEERS' && err.message !== 'PublishError.NoPeersSubscribedToTopic') {
      console.warn('Failed to announce dark pools:', err)
    } else {
      console.log('No peers subscribed to darkpool announce topic yet; announcement deferred.')
    }
  }
}

async function handleDarkPoolAnnouncement(msg) {
  try {
    const decoded = new TextDecoder().decode(msg.detail.data)
    const obj = JSON.parse(decoded)
    if (obj?.pools && Array.isArray(obj.pools)) {
      for (const poolName of obj.pools) {
        if (!knownPools.has(poolName)) {
          console.log(`🌐 Learned about new dark pool from announcement: ${poolName}`)
          knownPools.add(poolName)
          await ensureDarkPoolSubscription(poolName)
        }
      }
    }
  } catch (err) {
    console.error('Error handling dark pool announcement:', err)
  }
}

async function onDarkPoolSubscriptionsProtocol({ stream, connection }) {
  const peerIdStr = connection.remotePeer.toString()
  try {
    const pools = Array.from(knownPools)
    const msgStr = JSON.stringify({ pools })
    await pipe([Buffer.from(msgStr)], stream.sink)

    for await (const data of stream.source) {
      const received = data instanceof Uint8Array ? new TextDecoder().decode(data) : data.toString()
      const obj = JSON.parse(received)
      if (obj?.pools && Array.isArray(obj.pools)) {
        for (const poolName of obj.pools) {
          if (!knownPools.has(poolName)) {
            console.log(`🌐 Learned about new dark pool from peer ${peerIdStr}: ${poolName}`)
            knownPools.add(poolName)
            await ensureDarkPoolSubscription(poolName)
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error on dark pool subscriptions protocol with ${peerIdStr}:`, err)
  } finally {
    stream.close && await stream.close().catch(() => {})
  }
}

/**
 * Background task to prune pools with no activity beyond threshold and unsubscribe them.
 */
async function pruneInactivePools() {
  const now = Date.now()
  for (const [poolName, lastActive] of poolLastActivity.entries()) {
    if (now - lastActive > POOL_INACTIVITY_PRUNE_MS) {
      console.log(`🗑️ Pruning inactive pool: ${poolName}`)
      poolLastActivity.delete(poolName)
      knownPools.delete(poolName)
      if (darkPools[poolName]) {
        darkPools[poolName].clear()
        delete darkPools[poolName]
      }
      // Unsubscribe pubsub topic if subscribed
      const topic = `darkpool/${poolName}`
      const subscribedTopics = libp2pNode.services.pubsub.getTopics()
      if (subscribedTopics.includes(topic)) {
        try {
          await libp2pNode.services.pubsub.unsubscribe(topic)
          console.log(`✅ Unsubscribed from pruned dark pool topic: ${topic}`)
        } catch (err) {
          console.warn(`⚠️ Failed to unsubscribe from pruned dark pool ${topic}:`, err)
        }
      }
      // Announce updated pools list after pruning
      await announceKnownPools()
    }
  }
}

// Periodically prune inactive pools (every 10 minutes)
setInterval(() => {
  if (libp2pNode && libp2pNode.isStarted) {
    pruneInactivePools().catch(err => {
      console.warn('Error pruning inactive pools:', err)
    })
  }
}, 1000 * 60 * 10) // 10 minutes interval

async function connectToPeer(multiaddrStr) {
  try {
    let maddr = multiaddr(multiaddrStr)
    if (!maddr.getPeerId()) {
      const peerIdStr = multiaddrStr.split('/p2p/')[1]
      if (peerIdStr) maddr = maddr.encapsulate(`/p2p/${peerIdStr}`)
    }
    if (maddr.getPeerId() === libp2pNode.peerId.toString()) {
      throw new Error('Cannot dial self peer ID')
    }
    console.log(`Dialing peer at: ${maddr.toString()}`)
    const conn = await libp2pNode.dial(maddr)
    console.log('Connection established:', conn.remoteAddr.toString())
    try {
      const { stream } = await conn.newStream([DARKPOOL_SUBSCRIPTIONS_PROTOCOL])
      stream.close && stream.close().catch(() => {})
    } catch (err) {
      console.warn('Warning: failed to open darkpool subscriptions protocol stream:', err.message)
    }
    return true
  } catch (err) {
    console.error('Failed to dial peer:', err)
    throw new Error(`Failed to connect: ${err.message}`)
  }
}

const mockLogger = {
  forComponent: (name) => ({
    debug: (...args) => console.debug(`[${name}][DEBUG]`, ...args),
    info: (...args) => console.info(`[${name}][INFO]`, ...args),
    warn: (...args) => console.warn(`[${name}][WARN]`, ...args),
    error: (...args) => console.error(`[${name}][ERROR]`, ...args),
  }),
}

app.post('/api/subscribe', async (req, res) => {
  const { topic } = req.body
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid topic' })
  }
  try {
    await libp2pNode.services.pubsub.subscribe(topic)
    console.log(`✅ Subscribed to topic ${topic} via API request`)
    res.json({ success: true, topic })
  } catch (err) {
    console.error('Failed to subscribe via API:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/subscriptions', (_req, res) => {
  try {
    const topics = libp2pNode.services.pubsub.getTopics()
    res.json({ subscribedTopics: topics })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

async function startNode() {
  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: false,
      }),
      mdns: mdns({ interval: 10000, compat: true }),
      dht: kadDHT({
        enabled: true,
        clientMode: false,
        randomWalk: { enabled: true },
      }),
    },
    connectionManager: {
      minConnections: 1,
      maxConnections: 10,
      autoDial: false,
    },
  })

  await libp2pNode.services?.dht?.start()

  libp2pNode.handle(PROTOCOL, onOrdersProtocol)
  libp2pNode.handle(FLASH_PROTOCOL, onFlashChannel)
  libp2pNode.handle(DARKPOOL_SUBSCRIPTIONS_PROTOCOL, onDarkPoolSubscriptionsProtocol)

  libp2pNode.addEventListener('listening', () => {
    console.log('Listening on multiaddrs:')
    libp2pNode.getMultiaddrs().forEach(addr => console.log(addr.toString()))
  })

  libp2pNode.addEventListener('peer:discovery', async (evt) => {
    const peerId = evt.detail.id.toString()
    console.log('Discovered peer:', peerId)
    try {
      const peerInfo = await libp2pNode.peerStore.get(evt.detail.id)
      if (peerInfo.addresses.length > 0) {
        let authorized = false
        for (const poolName of Object.keys(darkPools)) {
          if (isPeerAuthorizedForPool(peerId, poolName)) {
            authorized = true
            break
          }
        }
        if (!authorized) {
          authorized = true
        }
        if (authorized) {
          const addrWithPeer = peerInfo.addresses[0].multiaddr.encapsulate(`/p2p/${peerId}`)
          console.log(`Attempting to connect to peer at: ${addrWithPeer}`)
          try {
            await libp2pNode.dial(addrWithPeer)
            console.log('✅ Successfully connected to discovered peer')
          } catch (err) {
            console.error('Failed to connect to discovered peer:', err)
          }
        } else {
          console.log(`Peer ${peerId} not authorized in dark pools; skipping dial`)
        }
      }
    } catch (err) {
      console.error('Error retrieving peer info:', err)
    }
  })

  libp2pNode.addEventListener('peer:connect', async (evt) => {
    console.log('✅ Connected to peer:', evt.detail.toString())
    try {
      await announceKnownPools()
    } catch { }
  })

  libp2pNode.addEventListener('peer:disconnect', (evt) => {
    console.log('🚫 Disconnected from peer:', evt.detail.toString())
  })

  await libp2pNode.start()
  console.log('✅ libp2p started with peerId:', libp2pNode.peerId.toString())

  const blockstore = new LevelBlockstore('./helia-blockstore-db')

  bitswap = await createBitswap({
    libp2p: libp2pNode,
    blockstore,
    logger: mockLogger,
  })

  heliaNode = await createHelia({
    libp2p: libp2pNode,
    blockstore,
    bitswap,
  })

  if (libp2pNode.services?.dht) {
    heliaNode.contentRouting = libp2pNode.services.dht
    console.log('✅ Helia content routing assigned from libp2p KadDHT')
  } else {
    console.warn('⚠️ Could not assign content routing to Helia (DHT missing)')
  }

  await libp2pNode.services.pubsub.subscribe('orders')
  console.log('✅ Subscribed to public "orders" topic')

  for (const poolName of Object.keys(darkPools)) {
    await ensureDarkPoolSubscription(poolName)
  }

  await libp2pNode.services.pubsub.subscribe(DARKPOOL_ANNOUNCE_TOPIC)
  libp2pNode.services.pubsub.addEventListener('message', async (evt) => {
    if (evt.detail.topic === DARKPOOL_ANNOUNCE_TOPIC) {
      await handleDarkPoolAnnouncement(evt)
      return
    }

    try {
      const dataStr = new TextDecoder().decode(evt.detail.data)
      let order
      if (ENCRYPTION_KEY) {
        try {
          order = decryptOrder(dataStr, ENCRYPTION_KEY)
        } catch {
          order = JSON.parse(dataStr)
        }
      } else {
        order = JSON.parse(dataStr)
      }
      const hash = JSON.stringify(order)
      if (!ordersCache.some(o => JSON.stringify(o) === hash)) {
        ordersCache.push(order)
        console.log('📦 Received order via pubsub:', order)
        notifyFlashChannels(order)
        if (order.pool) updatePoolActivity(order.pool)
      }
    } catch (err) {
      console.error('PubSub message error:', err)
    }
  })

  setTimeout(() => {
    announceKnownPools().catch(() => { })
  }, 5000)
}

async function syncOrdersToIPFS(orders, poolName = null) {
  let ordersToStore = orders
  if (poolName && ENCRYPTION_KEY) {
    ordersToStore = orders.map(order => ({
      encrypted: true,
      data: encryptOrder(order, ENCRYPTION_KEY),
      pool: poolName,
    }))
  }

  const encoded = new TextEncoder().encode(JSON.stringify(ordersToStore))
  const block = await encode({ value: encoded, codec: raw, hasher: sha256 })
  await heliaNode.blockstore.put(block.cid, block.bytes)
  ipfsOrdersCID = block.cid.toString()
  ordersCache = ordersToStore

  if (poolName) updatePoolActivity(poolName)

  try {
    if (heliaNode.contentRouting?.provide) {
      await heliaNode.contentRouting.provide(block.cid)
      console.log('📡 CID provided to network:', block.cid.toString())
    } else {
      console.warn('⚠️ Content routing not available')
    }
  } catch (err) {
    console.warn('CID provide error:', err)
  }

  const topic = poolName ? `darkpool/${poolName}` : 'orders'

  if (poolName) {
    await ensureDarkPoolSubscription(poolName)
  }

  try {
    const pubData = new TextEncoder().encode(JSON.stringify(ordersToStore))
    await libp2pNode.services.pubsub.publish(topic, pubData)
    console.log(`📢 Published orders to ${topic}`)
  } catch (err) {
    console.warn(`Pubsub publish error on topic ${topic}:`, err)
  }

  await announceKnownPools()

  return ipfsOrdersCID
}

async function broadcastOrder(order, poolName = null) {
  if (!order.id) order.id = generateOrderID('privateOrder-')
  if (!order.submittedAt) order.submittedAt = Date.now()
  if (poolName) updatePoolActivity(poolName)

  let dataToSend
  if (poolName && ENCRYPTION_KEY) {
    dataToSend = encryptOrder(order, ENCRYPTION_KEY)
  } else {
    dataToSend = JSON.stringify(order)
  }
  const encodedData = new TextEncoder().encode(dataToSend)

  const topic = poolName ? `darkpool/${poolName}` : 'orders'

  if (poolName) {
    await ensureDarkPoolSubscription(poolName)
  }

  try {
    await libp2pNode.services.pubsub.publish(topic, encodedData)
    console.log(`📢 Published single order to ${topic}`)
  } catch (err) {
    if (err.message.includes('NoPeersSubscribedToTopic')) {
      console.log(`⚠️ No peers subscribed to topic ${topic}, skipping pubsub publish`)
    } else {
      console.error('PubSub publish error:', err)
    }
  }

  const peers = libp2pNode.getPeers()
  if (peers.length === 0) {
    console.log('ℹ️ No peers connected to send order directly')
    return
  }

  for (const peerId of peers) {
    try {
      const streamOrRes = await libp2pNode.dialProtocol(peerId, PROTOCOL)
      const stream = streamOrRes?.stream ? streamOrRes.stream : streamOrRes
      if (!stream) {
        console.warn(`No stream returned from dialProtocol for peer ${peerId.toString()}, skipping`)
        continue
      }
      if (typeof stream.sink !== 'function') {
        console.warn(`stream.sink is not a function for peer ${peerId.toString()}, skipping`)
        continue
      }
      await pipe([encodedData], stream.sink)
      if (stream.close) await stream.close()
      console.log(`📤 Sent order to ${peerId.toString()}`)
    } catch (err) {
      console.error(`Failed to send to peer ${peerId.toString()}:`, err)
    }
  }
}

app.get('/api/peers', (_req, res) => {
  const peers = Array.from(libp2pNode.getPeers()).map(peerId => peerId.toString())
  res.json({ peers })
})

app.get('/api/addresses', (_req, res) => {
  const addresses = libp2pNode.getMultiaddrs().map(ma => ma.toString())
  res.json({ addresses })
})

app.get('/api/orders', async (req, res) => {
  const poolName = req.query.pool || null

  if (!ipfsOrdersCID) return res.json(ordersCache)

  try {
    const cid = CID.parse(ipfsOrdersCID)
    const bytes = await heliaNode.blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    let orders = new TextDecoder().decode(block.value)
    orders = JSON.parse(orders)

    if (poolName) {
      orders = orders.filter(o => {
        if (!o.pool && !poolName) return true
        return o.pool === poolName
      })
    }

    res.json(orders)
  } catch (err) {
    console.warn('IPFS read fallback to cache:', err)
    res.json(ordersCache)
  }
})

app.get('/api/orders/:cid', async (req, res) => {
  const { cid } = req.params
  try {
    const parsed = CID.parse(cid)
    const bytes = await heliaNode.blockstore.get(parsed)
    const block = await decode({ cid: parsed, bytes, codec: raw, hasher: sha256 })
    const orders = new TextDecoder().decode(block.value)
    res.json(JSON.parse(orders))
  } catch (err) {
    res.status(500).json({ error: 'Could not retrieve orders for CID', details: err.message })
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const { orders, order, poolName } = req.body

    if (poolName && !darkPools[poolName]) {
      darkPools[poolName] = new Set()
      knownPools.add(poolName)
      console.log(`Created new dark pool '${poolName}'`)
    }

    if (poolName && libp2pNode?.peerId) {
      darkPools[poolName].add(libp2pNode.peerId.toString())
      console.log(`Added self to dark pool '${poolName}' whitelist`)
    }

    if (orders) {
      const ipfsCid = await syncOrdersToIPFS(orders, poolName)
      await announceKnownPools()
      return res.json({ success: true, cid: ipfsCid })
    }
    if (order) {
      await broadcastOrder(order, poolName)
      await announceKnownPools()
      return res.json({ success: true, message: `Order broadcasted in ${poolName || 'public'}`, order })
    }
    res.status(400).json({ error: 'Missing orders or order' })
  } catch (err) {
    console.error('Failed to process orders request:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

app.post('/api/connect-peer', async (req, res) => {
  const { multiaddr: multiaddrStr } = req.body
  if (!multiaddrStr) return res.status(400).json({ error: 'Missing multiaddr' })

  try {
    await connectToPeer(multiaddrStr)
    res.json({ success: true, message: 'Connected to peer' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to connect to peer', details: err.message })
  }
})

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  try {
    if (libp2pNode) await libp2pNode.stop()
    console.log('Libp2p stopped')
    process.exit(0)
  } catch (err) {
    console.error('Error shutting down:', err)
    process.exit(1)
  }
})

app.listen(PORT, async () => {
  console.log(`🚀 Backend starting at http://localhost:${PORT}`)
  await startNode()
  console.log('Backend ready to accept requests')
})
