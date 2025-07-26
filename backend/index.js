// index.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import fetch from 'node-fetch'

import { createLibp2p } from 'libp2p'
import { createHelia } from 'helia'
import { LevelBlockstore } from 'blockstore-level'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'
import { CID } from 'multiformats/cid'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
let heliaNode, libp2pNode, ipfsOrdersCID = null, ordersCache = []

app.use(cors())
app.use(express.json())

function encryptOrder(order, secret) {
  const cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(secret, 'utf8'), Buffer.alloc(16, 0))
  return Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]).toString('hex')
}

function decryptOrder(encryptedHex, secret) {
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(secret, 'utf8'), Buffer.alloc(16, 0))
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString())
}

async function startNode() {
  const delegatedClient = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      delegatedRouting: () => delegatedClient,
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 })
    }
  })
  await libp2p.start()
  console.log('Libp2p started with peerId:', libp2p.peerId.toString())
  libp2pNode = libp2p
  heliaNode = await createHelia({
    libp2p,
    blockstore: new LevelBlockstore('./helia-blockstore-db')
  })
  console.log('Helia contentRouting:', heliaNode.contentRouting ? '✅ enabled' : '❌ undefined')
}
  
async function syncOrdersToIPFS(orders) {
  const encoded = new TextEncoder().encode(JSON.stringify(orders))
  const cid = await heliaNode.blockstore.put(encoded)
  ipfsOrdersCID = cid.toString()
  ordersCache = orders
  if (heliaNode.contentRouting?.provide) {
    try { await heliaNode.contentRouting.provide(cid); console.log('CID provided:', cid.toString()) }
    catch (err) { console.warn('Provide failed:', err) }
  } else {
    console.warn('No contentRouting.provide(), skipped provide')
  }
  return ipfsOrdersCID
}

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json([])
  try {
    const cid = CID.parse(ipfsOrdersCID)
    const bytes = await heliaNode.blockstore.get(cid)
    const data = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : ordersCache
    return res.json(data)
  } catch (err) {
    console.warn('Fetch error:', err)
    return res.json(ordersCache)
  }
})

app.post('/api/orders', async (req, res) => {
  try {
    const { orders, order, signature, metadata, encrypted = false, encryptKey = '' } = req.body
    if (!orders && !order) return res.status(400).json({ error: 'Missing orders or order payload' })
    let newOrders = orders ? [...orders] : [...ordersCache]
    if (order && signature) {
      const stored = encrypted
        ? { encrypted: true, data: encryptOrder({ order, signature, metadata }, encryptKey || process.env.ENCRYPTION_KEY) }
        : { order, signature, metadata }
      newOrders.push(stored)
      if (libp2pNode.services.pubsub) {
        await libp2pNode.services.pubsub.publish('orders', Buffer.from(encrypted ? stored.data : JSON.stringify(stored)))
      }
    }
    const newCID = await syncOrdersToIPFS(newOrders)
    return res.json({ success: true, ipfsCID: newCID })
  } catch (err) {
    console.error('Sync error:', err)
    return res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  startNode().then(() => console.log(`🚀 Server listening at http://localhost:${PORT}`))
  .catch(err => { console.error('Startup error:', err); process.exit(1) })
})

process.on('SIGINT', async () => {
  await heliaNode?.stop()
  await libp2pNode?.stop()
  console.log('Shutdown complete')
  process.exit(0)
})
