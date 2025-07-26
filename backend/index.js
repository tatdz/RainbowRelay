import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { createHelia } from 'helia'
import { CID } from 'multiformats/cid'

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'       // identify() factory
import { mdns } from '@libp2p/mdns'

import { LevelBlockstore } from 'blockstore-level'
// Correct: named import, NOT default
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// AES-256-CTR encryption helper
function encryptOrder(order, secret) {
  const cipher = crypto.createCipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0) // IV: 16 zero bytes
  )
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(order)),
    cipher.final(),
  ])
  return encrypted.toString('hex')
}

// AES-256-CTR decryption helper
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

let heliaNode
let libp2pNode
let ipfsOrdersCID = null
let ordersCache = []
let pubsubSubscribed = null

async function startHeliaNode() {
  // Create delegated routing factory with endpoint
  const delegatedRoutingFactory = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

  // Debug wrapper to confirm delegated routing factory is called properly by libp2p
  function delegatedRoutingDebugFactory(components) {
    console.log('delegatedRoutingDebugFactory called with components:', components)
    return delegatedRoutingFactory(components)
  }

  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      delegatedRouting: delegatedRoutingDebugFactory,
    },
    connectionManager: { minConnections: 25, maxConnections: 100 },
  })

  await libp2pNode.start()
  console.log('Libp2p started with peerId:', libp2pNode.peerId.toString())

  await new Promise((resolve) => setTimeout(resolve, 100)) // wait for libp2p warming up

  const blockstore = new LevelBlockstore('./helia-blockstore-db')

  heliaNode = await createHelia({
    libp2p: libp2pNode,
    blockstore,
  })

  console.log('Helia blockstore:', heliaNode.blockstore.constructor.name)
  console.log('Helia contentRouting:', heliaNode.contentRouting ? 'enabled' : 'undefined')

  const knownOrderHashes = new Set()

  pubsubSubscribed = new Promise((resolve) => {
    libp2pNode.services.pubsub.subscribe('orders', (msg) => {
      try {
        const dataStr = msg.data.toString()
        let received

        if (process.env.ENCRYPTION_KEY) {
          try {
            received = decryptOrder(dataStr, process.env.ENCRYPTION_KEY)
          } catch {
            received = JSON.parse(dataStr)
          }
        } else {
          received = JSON.parse(dataStr)
        }

        if (!received.order && !received.encrypted && !received.data) return

        const orderHash = JSON.stringify(received)
        if (knownOrderHashes.has(orderHash)) return

        knownOrderHashes.add(orderHash)
        ordersCache.push(received)

        libp2pNode.services.pubsub.publish('orders', Buffer.from(JSON.stringify(received))).catch((err) => {
          if (err.message === 'PublishError.NoPeersSubscribedToTopic') {
            console.warn('Publish warning:', err.message)
          } else {
            console.error('Publish error:', err)
          }
        })
      } catch (err) {
        console.error('PubSub message handler error:', err)
      }
    })
    console.log('Subscribed to pubsub topic: orders')
    resolve()
  })
}

/**
 * Store orders in Helia blockstore and provide CID on IPFS network
 * @param {Array} orders
 * @returns {Promise<string>} The CID string
 */
async function syncOrdersToIPFS(orders) {
  if (!heliaNode || !heliaNode.blockstore)
    throw new Error('Helia or blockstore not initialized')

  const encoded = new TextEncoder().encode(JSON.stringify(orders))
  const cid = await heliaNode.blockstore.put(encoded)

  ipfsOrdersCID = cid.toString()
  ordersCache = orders

  if (heliaNode.contentRouting?.provide) {
    try {
      await heliaNode.contentRouting.provide(cid)
      console.log('Provided IPFS CID on the network:', cid.toString())
    } catch (err) {
      console.warn('Failed to provide content routing:', err)
    }
  } else {
    console.warn('contentRouting.provide() not available, skipping provide.')
  }

  return ipfsOrdersCID
}

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json([])

  try {
    const cid = CID.parse(ipfsOrdersCID)
    const bytes = await heliaNode.blockstore.get(cid)
    if (!bytes) {
      console.warn('Blockstore returned no data for CID:', ipfsOrdersCID)
      return res.json(ordersCache)
    }

    const data = new TextDecoder().decode(bytes)
    return res.json(JSON.parse(data))
  } catch (err) {
    console.warn('Failed to fetch orders from IPFS:', err)
    return res.json(ordersCache)
  }
})

app.post('/api/orders', async (req, res) => {
  console.log('POST /api/orders body:', req.body)

  try {
    if (!req.body) return res.status(400).json({ error: 'Empty request body' })

    const { orders, order, signature, metadata, encrypted = false, encryptKey = '' } = req.body

    if (!orders && !order) return res.status(400).json({ error: 'Missing orders and order payload' })

    let newOrders = Array.isArray(orders) && orders.length ? [...orders] : [...ordersCache]

    if (order && signature) {
      const storedOrder = encrypted
        ? {
            encrypted: true,
            data: encryptOrder({ order, signature, metadata }, encryptKey || process.env.ENCRYPTION_KEY),
          }
        : { order, signature, metadata }

      newOrders.push(storedOrder)

      if (libp2pNode?.services?.pubsub) {
        try {
          await pubsubSubscribed
          const payload = encrypted ? storedOrder.data : JSON.stringify(storedOrder)
          await libp2pNode.services.pubsub.publish('orders', Buffer.from(payload))
          console.log('Published new order to pubsub')
        } catch (err) {
          console.warn('Failed to publish new order to pubsub:', err.message || err)
        }
      }
    }

    const newCID = await syncOrdersToIPFS(newOrders)
    return res.json({ success: true, ipfsCID: newCID })
  } catch (err) {
    console.error('Failed to sync orders:', err)
    return res.status(500).json({ error: 'Failed to sync orders with IPFS' })
  }
})

app.post('/api/gasless-fill', async (req, res) => {
  try {
    const relayerUrl = process.env.RELAYER_API_URL || 'http://localhost:3001'

    const response = await fetch(`${relayerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Relayer error: ${text}`)
    }

    const json = await response.json()
    return res.json({ success: true, transactionHash: json.hash })
  } catch (err) {
    console.error('Gasless fill relayer error:', err)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(PORT, async () => {
  try {
    // Uncomment below to clear Helia blockstore DB if needed
    // import { rmSync } from 'fs'
    // rmSync('./helia-blockstore-db', { recursive: true, force: true })

    await startHeliaNode()
    console.log(`🚀 Backend running at http://localhost:${PORT}`)
  } catch (err) {
    console.error('Failed to start backend:', err)
    process.exit(1)
  }
})

// Graceful shutdown on SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('Shutdown initiated.')
  try {
    if (heliaNode && heliaNode.blockstore.child?.child?.close) {
      await heliaNode.blockstore.child.child.close()
    }
    await heliaNode?.stop()
    await libp2pNode?.stop()
    console.log('Helia and libp2p nodes stopped gracefully.')
  } catch (err) {
    console.error('Error during shutdown:', err)
  }
  process.exit(0)
})
