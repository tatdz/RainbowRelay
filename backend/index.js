import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { LevelBlockstore } from 'blockstore-level'
import { CID } from 'multiformats/cid'
import { encode, decode } from 'multiformats/block'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'
import { ping } from '@libp2p/ping'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'

import { createBitswap } from '@helia/bitswap'
import { logger as libp2pLogger } from '@libp2p/logger'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

let heliaNode, libp2pNode, bitswap, ipfsOrdersCID = null, ordersCache = []

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

async function startNode() {
  const delegatedRouting = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      delegatedRouting: () => delegatedRouting
    }
  })

  await libp2pNode.start()
  console.log('✅ Libp2p started with peerId:', libp2pNode.peerId.toString())

  libp2pNode.getMultiaddrs().forEach(addr => {
    const fullAddr = addr.toString() + '/p2p/' + libp2pNode.peerId.toString()
    console.log('🧭 Listening on:', fullAddr)
  })

  const blockstore = new LevelBlockstore('./helia-blockstore-db')

  // Patch logger if missing forComponent method (required by bitswap)
  if (typeof libp2pLogger.forComponent !== 'function') {
    libp2pLogger.forComponent = () => libp2pLogger
  }

  bitswap = await createBitswap({
    libp2p: libp2pNode,
    blockstore,
    logger: libp2pLogger
  })

  heliaNode = await createHelia({ libp2p: libp2pNode, blockstore, bitswap })

  // *** HERE: Manually assign delegatedRouting as heliaNode.contentRouting ***
  heliaNode.contentRouting = delegatedRouting

  console.log('✅ Helia node started — routing:', !!heliaNode.contentRouting)

  const seenHashes = new Set()

  // Subscribe to 'orders' pubsub topic
  await libp2pNode.services.pubsub.subscribe('orders')

  libp2pNode.services.pubsub.addEventListener('message', async (evt) => {
    try {
      const dataStr = new TextDecoder().decode(evt.detail.data)
      let order

      if (process.env.ENCRYPTION_KEY) {
        try {
          order = decryptOrder(dataStr, process.env.ENCRYPTION_KEY)
        } catch {
          order = JSON.parse(dataStr)
        }
      } else {
        order = JSON.parse(dataStr)
      }

      const hash = JSON.stringify(order)
      if (seenHashes.has(hash)) return

      seenHashes.add(hash)
      ordersCache.push(order)

      console.log('📦 Received and cached order:', order)

      try {
        await libp2pNode.services.pubsub.publish('orders', Buffer.from(JSON.stringify(order)))
      } catch (err) {
        if (err.message.includes('NoPeersSubscribedToTopic')) {
          console.warn('⚠️ No peers on topic, skipping re-publish')
        } else {
          throw err
        }
      }
    } catch (err) {
      console.error('PubSub error:', err)
    }
  })

  console.log('✅ Subscribed to "orders" topic')
}

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

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json([])

  try {
    const cid = CID.parse(ipfsOrdersCID)
    const bytes = await heliaNode.blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    res.json(JSON.parse(new TextDecoder().decode(block.value)))
  } catch (err) {
    console.warn('IPFS read fallback to cache:', err)
    res.json(ordersCache)
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const { orders, order, signature, metadata, encrypted = false, encryptKey = '' } = req.body
    let newOrders = orders && orders.length ? [...orders] : [...ordersCache]

    if (order && signature) {
      const storedOrder = encrypted
        ? {
            encrypted: true,
            data: encryptOrder({ order, signature, metadata }, encryptKey || process.env.ENCRYPTION_KEY),
          }
        : { order, signature, metadata }

      newOrders.push(storedOrder)

      const payload = encrypted ? storedOrder.data : JSON.stringify(storedOrder)

      try {
        await libp2pNode.services.pubsub.publish('orders', Buffer.from(payload))
      } catch (err) {
        if (err.message.includes('NoPeersSubscribedToTopic')) {
          console.warn('⚠️ No peers on topic, skipping publish')
        } else {
          throw err
        }
      }
    }

    const newCID = await syncOrdersToIPFS(newOrders)
    res.json({ success: true, ipfsCID: newCID })
  } catch (err) {
    console.error('Order sync failed:', err)
    res.status(500).json({ error: 'Failed to sync orders' })
  }
})

app.post('/api/gasless-fill', async (req, res) => {
  try {
    const relayerUrl = process.env.RELAYER_API_URL || 'http://localhost:3001'

    const response = await fetch(`${relayerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })

    if (!response.ok) throw new Error(`Relayer error: ${await response.text()}`)
    const json = await response.json()
    res.json({ success: true, transactionHash: json.hash })
  } catch (err) {
    console.error('Gasless fill failed:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

startNode()
  .then(() => app.listen(PORT, () => console.log(`🚀 Backend at http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Startup error:', err)
    process.exit(1)
  })
