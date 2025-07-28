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
import { gossipsub } from '@chainsafe/libp2p-gossipsub'  // Correct package name

import { multiaddr } from '@multiformats/multiaddr'
import { CID } from 'multiformats/cid'
import { encode, decode } from 'multiformats/block'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

import { Level } from 'level'
import { LevelBlockstore } from 'blockstore-level'
import { createHelia } from 'helia'
import { createBitswap } from '@helia/bitswap'

dotenv.config()

const PORT = process.env.PORT || 3000
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

const PROTOCOL = '/orders/1.0.0'
const FLASH_PROTOCOL = '/orders/flash/1.0.0'
const DARKPOOL_SUBSCRIPTIONS_PROTOCOL = '/darkpool/subscriptions/1.0.0'
const DARKPOOL_ANNOUNCE_TOPIC = 'darkpool:announce'
const POOL_INACTIVITY_MS = 15 * 60 * 1000
const app = express()
app.use(express.json())

const levelDB = new Level('./blockstore')
const blockstore = new LevelBlockstore(levelDB)

// Globals
let libp2pNode
let helia
let bitswap
let ipfsCID = null
let ordersCache = []

const darkPools = {}
const knownPools = new Set()
const poolActivity = new Map()
const flashStreams = new Map()

function generateOrderID(prefix = '') {
  return `${prefix}${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

function updatePoolActivity(pool) {
  if (pool) poolActivity.set(pool, Date.now())
}

function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  return Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]).toString('hex')
}

function decryptOrder(encrypted, key) {
  const data = Buffer.from(encrypted, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  return JSON.parse(decipher.update(data).toString() + decipher.final().toString())
}

function isPeerAuthorized(peerId, pool) {
  return darkPools[pool]?.has(peerId)
}

/** Protocol Handlers **/

async function onOrdersProtocol({ stream, connection }) {
  return new Promise((resolve) => {
    let order = null
    const parser = new JSONParser()
    parser.onValue = function (value) {
      if (this.stack.length === 0) order = value
    }
    parser.onError = () => resolve()
    ;(async () => {
      try {
        for await (const chunk of stream.source) {
          const buf = typeof chunk.slice === 'function' ? chunk.slice() : chunk
          parser.write(Buffer.from(buf))
        }
      } catch {
        // ignore
      }
      try {
        if (order) {
          let decoded = order
          if (ENCRYPTION_KEY) {
            try {
              if (typeof order === 'string') {
                decoded = decryptOrder(order, ENCRYPTION_KEY)
              } else if (order.encrypted && typeof order.data === 'string') {
                decoded = decryptOrder(order.data, ENCRYPTION_KEY)
              }
            } catch {
              // ignore decrypt failures
            }
          }
          const hash = JSON.stringify(decoded)
          if (!ordersCache.some(o => JSON.stringify(o) === hash)) {
            ordersCache.push(decoded)
            console.log('📦 Received order via protocol:', decoded)
            if (decoded.pool) updatePoolActivity(decoded.pool)
            notifyFlashStreams(decoded)
          }
        }
      } finally {
        resolve()
      }
    })()
  })
}

async function notifyFlashStreams(order) {
  const encoded = new TextEncoder().encode(JSON.stringify(order))
  for (const [peerId, stream] of flashStreams.entries()) {
    try {
      await pipe([encoded], stream.sink)
      console.log(`⚡ Sent flash notification to peer ${peerId}`)
    } catch (err) {
      console.warn(`Failed flash notify to peer ${peerId}:`, err)
    }
  }
}

async function onFlashProtocol({ stream, connection }) {
  const peerId = connection.remotePeer.toString()
  flashStreams.set(peerId, stream)
  console.log(`⚡ Flash protocol connection opened: ${peerId}`)

  const interval = setInterval(async () => {
    try {
      await pipe([new TextEncoder().encode(JSON.stringify({ type: 'heartbeat' }))], stream.sink)
    } catch {
      // ignore heartbeat send errors
    }
  }, 30000)

  try {
    for await (const msg of stream.source) {
      const bytes = typeof msg.subarray === 'function' ? msg.subarray() : msg
      if (!(bytes instanceof Uint8Array)) continue
      const decoded = new TextDecoder().decode(bytes)
      console.log(`⚡ Flash message from ${peerId}:`, decoded)
    }
  } catch {
    // ignore
  } finally {
    clearInterval(interval)
    flashStreams.delete(peerId)
    console.log(`⚡ Flash protocol connection closed: ${peerId}`)
  }
}

async function onDarkPoolSubscriptionsProtocol({ stream, connection }) {
  const peerId = connection.remotePeer.toString()
  try {
    const known = Array.from(knownPools)
    const msg = JSON.stringify({ pools: known })
    await pipe([Buffer.from(msg)], stream.sink)

    for await (const data of stream.source) {
      const str = data instanceof Uint8Array ? new TextDecoder().decode(data) : data.toString()
      const obj = JSON.parse(str)
      if (obj?.pools instanceof Array) {
        for (const pool of obj.pools) {
          if (!knownPools.has(pool)) {
            knownPools.add(pool)
            await ensurePoolSubscription(pool)
            console.log(`🌐 Learned new pool ${pool} from peer ${peerId}`)
          }
        }
      }
    }
  } catch (err) {
    console.error('DarkPool subscription protocol error:', err)
  } finally {
    if (stream.close) await stream.close()
  }
}

async function ensurePoolSubscription(pool) {
  if (!pool || !libp2pNode || knownPools.has(pool)) return
  knownPools.add(pool)
  const topic = `darkpool/${pool}`
  if (!libp2pNode.services.pubsub.getTopics().includes(topic)) {
    try {
      await libp2pNode.services.pubsub.subscribe(topic)
      console.log(`✅ Subscribed to ${topic}`)
    } catch (err) {
      console.warn(`Subscription failed for ${topic}:`, err)
    }
  }
}

async function announcePools() {
  if (!libp2pNode || knownPools.size === 0) return
  try {
    const announcement = JSON.stringify({ pools: Array.from(knownPools) })
    await libp2pNode.services.pubsub.publish(DARKPOOL_ANNOUNCE_TOPIC, new TextEncoder().encode(announcement))
    console.log(`📢 Announced pools: ${Array.from(knownPools).join(', ')}`)
  } catch (err) {
    if (!String(err).includes('NoPeers')) {
      console.warn('Announce pools error:', err)
    }
  }
}

async function handleAnnouncement(evt) {
  if (evt.topic !== DARKPOOL_ANNOUNCE_TOPIC) return
  try {
    const msg = new TextDecoder().decode(evt.detail.data)
    const obj = JSON.parse(msg)
    if (obj?.pools instanceof Array) {
      for (const pool of obj.pools) {
        if (!knownPools.has(pool)) {
          knownPools.add(pool)
          await ensurePoolSubscription(pool)
          console.log(`🌐 Learned new pool ${pool} from announcement`)
        }
      }
    }
  } catch (err) {
    console.error('Handle announcement failed:', err)
  }
}

function prunePools() {
  const now = Date.now()
  for (const [pool, lastActive] of poolActivity.entries()) {
    if (now - lastActive > POOL_INACTIVITY_MS) {
      console.log(`🗑️ Pruning inactive pool ${pool}`)
      poolActivity.delete(pool)
      knownPools.delete(pool)
      if (darkPools[pool]) {
        delete darkPools[pool]
      }
      if (!libp2pNode) return
      const topic = `darkpool/${pool}`
      if (libp2pNode.services.pubsub.getTopics().includes(topic)) {
        libp2pNode.services.pubsub.unsubscribe(topic).catch(() => {})
        announcePools().catch(() => {})
        console.log(`Unsubscribed and removed inactive pool ${pool}`)
      }
    }
  }
}

setInterval(() => {
  if (libp2pNode?.isStarted) prunePools()
}, 10 * 60 * 1000)

// Dial helper with protocol specified

async function connectPeer(addrStr) {
  if (!libp2pNode) throw new Error('libp2p not started')
  try {
    let addr = multiaddr(addrStr)
    if (!addr.getPeerId()) {
      const pid = addrStr.split('/p2p/')[1]
      if (pid) addr = addr.encapsulate(`/p2p/${pid}`)
    }
    if (addr.getPeerId().toString() === libp2pNode.peerId.toString()) {
      throw new Error('Cannot dial self')
    }
    console.log(`Dialing ${addr.toString()}`)
    const conn = await libp2pNode.dialProtocol(addr, PROTOCOL)
    if (conn.stream && conn.stream.close) await conn.stream.close()
    console.log(`Connected to ${addr.toString()}`)
    return true
  } catch (err) {
    console.error('Dial error:', err)
    throw err
  }
}

async function syncOrders(orders, pool) {
  let data = orders
  if (pool && ENCRYPTION_KEY) {
    data = orders.map(o => ({
      encrypted: true,
      data: encryptOrder(o, ENCRYPTION_KEY),
      pool
    }))
  }
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const block = await encode({ value: encoded, codec: raw, hasher: sha256 })
  await blockstore.put(block.cid, block.bytes)
  ipfsCID = block.cid.toString()
  ordersCache = data
  if (pool) updatePoolActivity(pool)
  try {
    if (helia.contentRouting?.provide) {
      await helia.contentRouting.provide(block.cid)
      console.log(`🔗 Provided CID ${block.cid.toString()}`)
    }
  } catch {}
  await ensurePoolSubscription(pool)
  try {
    await libp2pNode.services.pubsub.publish(pool ? `darkpool/${pool}` : 'orders', encoded)
    console.log(`Published orders to ${pool ?? 'orders'}`)
  } catch {}
  await announcePools()
  return ipfsCID
}

async function broadcastOrder(order, pool) {
  if (!order || typeof order !== 'object') throw new Error('Order must be an object')
  if (order.encrypted && typeof order !== 'object') throw new Error('Encrypted order must be a string')

  if (!order.id) order.id = generateOrderID('privateOrder-')
  if (!order.submitted) order.submitted = Date.now()
  if (pool) updatePoolActivity(pool)

  let payload = pool && ENCRYPTION_KEY ? encryptOrder(order, ENCRYPTION_KEY) : JSON.stringify(order)

  const topic = pool ? `darkpool/${pool}` : 'orders'
  await ensurePoolSubscription(pool)

  const encoded = new TextEncoder().encode(payload)
  try {
    await libp2pNode.services.pubsub.publish(topic, encoded)
    console.log(`Published single order to ${topic}`)
  } catch (err) {
    if (!String(err).includes('NoPeers')) {
      throw err
    }
  }

  for (const peerId of libp2pNode.getPeers()) {
    try {
      const { stream } = await libp2pNode.dialProtocol(peerId, PROTOCOL)
      await pipe([encoded], stream.sink)
      stream.close?.()
      console.log(`Sent order to ${peerId.toString()}`)
    } catch (err) {
      console.warn(`Failed to send order to ${peerId.toString()}:`, err)
    }
  }
}

// Express Routes

app.post('/api/subscribe', async (req, res) => {
  const { topic } = req.body
  if (!topic || typeof topic !== 'string')
    return res.status(400).json({ error: 'Invalid topic' })
  try {
    await libp2pNode.services.pubsub.subscribe(topic)
    console.log(`✅ Subscribed to ${topic}`)
    res.json({ success: true, topic })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/subscriptions', (req, res) => {
  if (!libp2pNode) return res.json({ subscriptions: [] })
  try {
    res.json({ subscriptions: libp2pNode.services.pubsub.getTopics() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/orders', async (req, res) => {
  const pool = req.query.pool ?? null
  if (!ipfsCID) return res.json(ordersCache)
  try {
    const cid = CID.parse(ipfsCID)
    const bytes = await blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    const data = JSON.parse(new TextDecoder().decode(block.value))
    res.json(pool ? data.filter(o => o.pool === pool) : data)
  } catch {
    res.json(ordersCache)
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    let { order, orders, pool } = req.body
    if (order && ENCRYPTION_KEY && typeof order === 'string') {
      order = decryptOrder(order, ENCRYPTION_KEY)
    }
    if (!order && !orders) return res.status(400).json({ error: 'Missing order(s)' })
    if (order && typeof order !== 'object') return res.status(400).json({ error: 'Order must be an object' })

    if (order) {
      if (!order.id) order.id = generateOrderID('privateOrder-')
      if (!order.submitted) order.submitted = Date.now()
    }
    if (pool) {
      if (!darkPools[pool]) {
        darkPools[pool] = new Set()
        knownPools.add(pool)
      }
      if (libp2pNode) darkPools[pool].add(libp2pNode.peerId.toString())
    }
    if (orders) {
      const cid = await syncOrders(orders, pool)
      await announcePools()
      return res.json({ success: true, cid })
    }
    if (order) {
      await broadcastOrder(order, pool)
      await announcePools()
      return res.json({ success: true, order })
    }
    res.status(400).json({ error: 'No valid order or orders provided' })
  } catch (err) {
    console.error('Order post error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/connect', async (req, res) => {
  const { multiaddr: addr } = req.body
  if (!addr) return res.status(400).json({ error: 'Missing multiaddr' })
  try {
    await connectPeer(addr)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Graceful shutdown

process.on('SIGINT', async () => {
  try {
    await libp2pNode?.stop()
    console.log('Libp2p stopped gracefully')
    process.exit(0)
  } catch {
    process.exit(1)
  }
})

// Global error handler

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ status: 'error', message: err.message || 'Internal Server Error' })
})

// Server startup

app.listen(PORT, async () => {
  console.log(`🚀 Backend starting at http://localhost:${PORT}`)
  await startNode()
  console.log(`✅ libp2p started with peerId: ${libp2pNode?.peerId.toString()}`)
  console.log(`✅ Helia routing assigned: ${!!helia?.contentRouting}`)
  console.log(`✅ Subscribed to 'orders' topic`)
  console.log('Backend ready to accept requests')
})

// Logger singleton

const mockLogger = {
  forComponent: name => ({
    debug: (...args) => console.debug(`[${name}][DEBUG]`, ...args),
    info: (...args) => console.info(`[${name}][INFO]`, ...args),
    warn: (...args) => console.warn(`[${name}][WARN]`, ...args),
    error: (...args) => console.error(`[${name}][ERROR]`, ...args),
  }),
}

// Start libp2p and supporting nodes

async function startNode() {
  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    connectionManager: { minConnections: 1, maxConnections: 10, autoDial: false },
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: false,
      }),
      mdns: mdns({ interval: 10_000, compat: true }),
      dht: kadDHT({
        enabled: true,
        clientMode: false,
        randomWalk: { enabled: true },
      }),
    },
  })

  await libp2pNode.start()
  await libp2pNode.services.dht.start()

  libp2pNode.handle(PROTOCOL, onOrdersProtocol)
  libp2pNode.handle(FLASH_PROTOCOL, onFlashProtocol)
  libp2pNode.handle(DARKPOOL_SUBSCRIPTIONS_PROTOCOL, onDarkPoolSubscriptionsProtocol)

  libp2pNode.addEventListener('listening', () => {
    console.log('Listening on multiaddrs:')
    libp2pNode.getMultiaddrs().forEach(addr => console.log(addr.toString()))
  })

  libp2pNode.addEventListener('peer:discovery', async evt => {
    const pid = evt.detail.id.toString()
    console.log(`Discovered peer ${pid}`)
    if (pid === libp2pNode.peerId.toString()) return
    try {
      const peerInfo = await libp2pNode.peerStore.get(evt.detail.id)
      if (!peerInfo) return
      const allowed = Object.keys(darkPools).some(pool => isPeerAuthorized(pid, pool)) || true
      if (!allowed) {
        console.log(`Peer ${pid} not authorized; skipping dial`)
        return
      }
      for (const addr of peerInfo.addresses) {
        try {
          const dialAddr = addr.multiaddr.encapsulate(`/p2p/${pid}`)
          console.log(`Dialing discovered peer at ${dialAddr}`)
          await libp2pNode.dialProtocol(dialAddr, PROTOCOL)
          console.log(`✅ Connected to peer ${pid}`)
          break
        } catch {
          // ignore dial failures
        }
      }
    } catch (err) {
      console.error('Discovery error', err)
    }
  })

  libp2pNode.addEventListener('peer:connect', evt => {
    console.log(`✅ Connected to peer ${evt.detail.toString()}`)
    announcePools().catch(() => {})
  })

  libp2pNode.addEventListener('peer:disconnect', evt => {
    console.log(`❌ Disconnected from peer ${evt.detail.toString()}`)
  })

  bitswap = await createBitswap({
    libp2p: libp2pNode,
    blockstore,
    logger: mockLogger,
  })

  helia = await createHelia({
    libp2p: libp2pNode,
    blockstore,
    bitswap,
  })

  if (libp2pNode.services.dht) {
    helia.contentRouting = libp2pNode.services.dht
    console.log('✅ Helia content routing enabled')
  } else {
    console.warn('⚠️ Helia content routing not available')
  }

  await libp2pNode.services.pubsub.subscribe('orders')
  console.log('✅ Subscribed to "orders" topic')

  for (const pool of Object.keys(darkPools)) {
    await ensurePoolSubscription(pool)
  }

  await libp2pNode.services.pubsub.subscribe(DARKPOOL_ANNOUNCE_TOPIC)
  libp2pNode.services.pubsub.addEventListener('message', async evt => {
    if (evt.topic === DARKPOOL_ANNOUNCE_TOPIC) {
      await handleAnnouncement(evt)
      return
    }
    try {
      const txt = new TextDecoder().decode(evt.detail.data)
      let payload
      if (ENCRYPTION_KEY) {
        try {
          payload = decryptOrder(txt, ENCRYPTION_KEY)
        } catch {
          payload = JSON.parse(txt)
        }
      } else {
        payload = JSON.parse(txt)
      }
      const h = JSON.stringify(payload)
      if (!ordersCache.some(o => JSON.stringify(o) === h)) {
        ordersCache.push(payload)
        notifyFlashStreams(payload)
        if (payload.pool) updatePoolActivity(payload.pool)
        console.log('📦 New order via pubsub:', payload)
      }
    } catch {
      // ignore message errors
    }
  })

  // Announce initial pools shortly after start
  setTimeout(() => announcePools().catch(() => {}), 5000)
}
