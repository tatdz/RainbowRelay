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
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || null
const PROTOCOL = '/orders/1.0.0'

const app = express()
app.use(express.json())

let libp2pNode
let heliaNode
let bitswap
let ipfsOrdersCID = null
let ordersCache = []

// Encryption helpers (AES-256-CTR with zero IV)
function encryptOrder(order, secret) {
  const cipher = crypto.createCipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0)
  )
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()])
  return encrypted.toString('hex')
}

function decryptOrder(encryptedHex, secret) {
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0)
  )
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return JSON.parse(decrypted.toString())
}

// Protocol handler for /orders/1.0.0 streams
async function onOrdersProtocol({ stream }) {
  return new Promise((resolve) => {
    const parser = new JSONParser()
    let order = null
    const chunks = []

    parser.onValue = function (value) {
      // When a full JSON object is parsed at root level:
      if (this.stack.length === 0) {
        order = value
      }
    }

    parser.onError = function (err) {
      console.error('JSON parse error in streaming protocol:', err)
      resolve() // end processing on error
    }

    // Collect chunks and feed parser
    ;(async () => {
      try {
        for await (const chunk of stream.source) {
          let bufferToParse
          if (typeof chunk.slice === 'function') {
            bufferToParse = chunk.slice()
          } else {
            bufferToParse = chunk
          }
          parser.write(Buffer.from(bufferToParse))
        }
      } catch (err) {
        console.error('Error reading stream for protocol:', err)
      } finally {
        try {
          if (order) {
            let decryptedOrder = order
            if (ENCRYPTION_KEY) {
              try {
                decryptedOrder = decryptOrder(JSON.stringify(order), ENCRYPTION_KEY)
              } catch {
                // fallback to original
              }
            }
            const hash = JSON.stringify(decryptedOrder)
            if (!ordersCache.some(o => JSON.stringify(o) === hash)) {
              ordersCache.push(decryptedOrder)
              console.log('📦 Received order via protocol:', decryptedOrder)
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

// Connect to peer by multiaddr string, append peer ID suffix if missing
async function connectToPeer(multiaddrStr) {
  try {
    let maddr = multiaddr(multiaddrStr)

    if (!maddr.getPeerId()) {
      const peerIdStr = multiaddrStr.split('/p2p/')[1]
      if (peerIdStr) {
        maddr = maddr.encapsulate(`/p2p/${peerIdStr}`)
      }
    }

    // Prevent dialing self
    if (maddr.getPeerId() === libp2pNode.peerId.toString()) {
      throw new Error('Attempted to dial self peer ID, which is not allowed')
    }

    console.log(`Dialing peer at: ${maddr.toString()}`)

    const connection = await libp2pNode.dial(maddr)
    console.log('Connection established:', connection.remoteAddr.toString())

    // newStream returns stream directly, do not destructure
    const stream = await connection.newStream([PROTOCOL])
    console.log('Protocol stream opened')

    // Close the stream politely
    if (stream.close) await stream.close()

    return true
  } catch (err) {
    console.error('Failed to dial peer:', err)
    throw new Error(`Failed to connect to peer ${multiaddrStr}: ${err.message}`)
  }
}

// Bitswap logger for compatibility with libp2p utils
const mockLogger = {
  forComponent: (name) => ({
    debug: (...args) => console.debug(`[${name}][DEBUG]`, ...args),
    info: (...args) => console.info(`[${name}][INFO]`, ...args),
    warn: (...args) => console.warn(`[${name}][WARN]`, ...args),
    error: (...args) => console.error(`[${name}][ERROR]`, ...args),
  }),
}

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
      dht: kadDHT(),
    },
    connectionManager: {
      minConnections: 1,
      maxConnections: 10,
      autoDial: false,
    },
  })

  // Log encryption modules loaded for diagnostic
  const encryptionModules = libp2pNode.connectionEncrypters || []
  console.log('Connection Encryption modules:', encryptionModules.map(p => p.protocol))

  libp2pNode.handle(PROTOCOL, onOrdersProtocol)

  libp2pNode.addEventListener('listening', () => {
    console.log('Listening on multiaddrs (without peer ID):')
    libp2pNode.getMultiaddrs().forEach(addr => console.log(addr.toString()))

    const peerIdStr = libp2pNode.peerId.toString()
    const addrsWithPeerId = libp2pNode.getMultiaddrs().map(addr =>
      addr.encapsulate(`/p2p/${peerIdStr}`)
    )
    console.log('🎧 Listening on multiaddrs (with peer ID appended):')
    addrsWithPeerId.forEach(addr => console.log(addr.toString()))
  })

  libp2pNode.addEventListener('peer:discovery', async (evt) => {
    const peerId = evt.detail.id
    console.log('Discovered peer:', peerId.toString())

    try {
      const peer = await libp2pNode.peerStore.get(peerId)
      if (peer.addresses.length > 0) {
        const addrWithPeerId = peer.addresses[0].multiaddr.encapsulate(`/p2p/${peerId.toString()}`)
        console.log(`Attempting to connect to discovered peer at: ${addrWithPeerId.toString()}`)
        try {
          await libp2pNode.dial(addrWithPeerId)
          console.log('✅ Successfully connected to discovered peer')
        } catch (err) {
          console.error('Failed to connect to discovered peer:', err)
        }
      } else {
        console.log('No addresses found for discovered peer.')
      }
    } catch (err) {
      console.error('Error retrieving peer info:', err)
    }
  })

  libp2pNode.addEventListener('peer:connect', evt => {
    console.log('✅ Connected to peer:', evt.detail.toString())
  })

  libp2pNode.addEventListener('connection:open', evt => {
    console.log('🔗 Connection opened to:', evt.detail.remotePeer.toString())
  })

  libp2pNode.addEventListener('peer:disconnect', evt => {
    console.log('🚫 Disconnected from peer:', evt.detail.toString())
  })

  await libp2pNode.start()
  console.log('✅ Libp2p started with peerId:', libp2pNode.peerId.toString())

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

  console.log('✅ Helia node started')

  await libp2pNode.services.pubsub.subscribe('orders')
  console.log('✅ Subscribed to "orders" topic')

  libp2pNode.services.pubsub.addEventListener('message', async (evt) => {
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
      }
    } catch (err) {
      console.error('PubSub message error:', err)
    }
  })
}

// Sync orders to IPFS via Helia
async function syncOrdersToIPFS(orders) {
  const encoded = new TextEncoder().encode(JSON.stringify(orders))
  const block = await encode({ value: encoded, codec: raw, hasher: sha256 })
  await heliaNode.blockstore.put(block.cid, block.bytes)
  ipfsOrdersCID = block.cid.toString()
  ordersCache = orders

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
  return ipfsOrdersCID
}

// Broadcast order to pubsub and peers over protocol with robust checks
async function broadcastOrder(order) {
  let dataToSend
  if (ENCRYPTION_KEY) {
    dataToSend = encryptOrder(order, ENCRYPTION_KEY)
  } else {
    dataToSend = JSON.stringify(order)
  }
  const encodedData = new TextEncoder().encode(dataToSend)

  // Publish to pubsub topic 'orders'
  try {
    await libp2pNode.services.pubsub.publish('orders', encodedData)
    console.log('📢 Published order to pubsub')
  } catch (err) {
    if (err.message.includes('NoPeersSubscribedToTopic')) {
      console.log('⚠️ No peers subscribed to topic, skipping pubsub publish')
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
      console.log(`dialProtocol() returned for peer ${peerId.toString()}:`, stream)

      if (!stream) {
        console.warn(`No stream returned from dialProtocol for peer ${peerId.toString()}, skipping`)
        continue
      }
      if (typeof stream.sink !== 'function') {
        console.warn(`stream.sink is not a function for peer ${peerId.toString()}, skipping`)
        continue
      }

      await pipe([encodedData], stream.sink)

      if (stream.close) {
        await stream.close()
      }
      console.log(`📤 Sent order to ${peerId.toString()}`)
    } catch (err) {
      console.error(`Failed to send to peer ${peerId.toString()}:`, err)
    }
  }
}

// Express API endpoints
app.get('/api/peers', (_req, res) => {
  const peers = Array.from(libp2pNode.getPeers()).map(peerId => peerId.toString())
  res.json({ peers })
})

app.get('/api/addresses', (_req, res) => {
  const addresses = libp2pNode.getMultiaddrs().map(ma => ma.toString())
  res.json({ addresses })
})

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json(ordersCache)
  try {
    const cid = CID.parse(ipfsOrdersCID)
    const bytes = await heliaNode.blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    const orders = new TextDecoder().decode(block.value)
    ordersCache = JSON.parse(orders)
    res.json(ordersCache)
  } catch (err) {
    console.warn('IPFS read fallback to cache:', err)
    res.json(ordersCache)
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const { orders, order } = req.body
    if (orders) {
      const ipfsCid = await syncOrdersToIPFS(orders)
      return res.json({ success: true, cid: ipfsCid })
    }
    if (order) {
      await broadcastOrder(order)
      return res.json({ success: true, message: 'Order broadcasted', order })
    }
    res.status(400).json({ error: 'Missing orders or order' })
  } catch (err) {
    console.error('Failed to process orders request:', err)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

app.post('/api/connect-peer', async (req, res) => {
  const { multiaddr: multiaddrStr } = req.body
  if (!multiaddrStr) {
    return res.status(400).json({ error: 'Missing multiaddr' })
  }
  try {
    await connectToPeer(multiaddrStr)
    res.json({ success: true, message: 'Connected to peer' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to connect to peer', details: err.message })
  }
})

// Graceful shutdown
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

// Start Express server and libp2p node
app.listen(PORT, async () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
  await startNode()
})
