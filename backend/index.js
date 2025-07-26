// index.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { LevelBlockstore } from 'blockstore-level'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { encode, decode } from 'multiformats/block'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'

// libp2p modules
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { mdns } from '@libp2p/mdns'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000
let heliaNode, libp2pNode, ipfsCID = null, cache = []

app.use(cors())
app.use(express.json())

async function startNode() {
  const delegatedRouting = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      delegatedRouting: () => delegatedRouting
    }
  })

  await libp2p.start()
  libp2pNode = libp2p
  console.log('✅ Libp2p started with peerId:', libp2p.peerId.toString())

  const blockstore = new LevelBlockstore('./helia-blockstore-db')
  heliaNode = await createHelia({ libp2p, blockstore })

  console.log('✅ Helia contentRouting:', heliaNode.contentRouting ? '✔️ enabled' : '❌ unavailable')
}

async function syncToIPFS(data) {
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const block = await encode({ value: encoded, codec: raw, hasher: sha256 })

  await heliaNode.blockstore.put(block.cid, block.bytes)
  ipfsCID = block.cid.toString()
  cache = data

  if (heliaNode.contentRouting?.provide) {
    try {
      await heliaNode.contentRouting.provide(block.cid)
      console.log('📡 CID provided:', block.cid.toString())
    } catch (err) {
      console.error('Failed to provide CID:', err)
    }
  }

  return ipfsCID
}

app.get('/api', async (_req, res) => {
  if (!ipfsCID) return res.json([])

  try {
    const cid = CID.parse(ipfsCID)
    const bytes = await heliaNode.blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    res.json(JSON.parse(new TextDecoder().decode(block.value)))
  } catch (err) {
    console.error('Read error:', err)
    res.status(500).json({ error: 'Failed to read data' })
  }
})

app.post('/api', async (req, res) => {
  try {
    const newData = req.body
    const cid = await syncToIPFS(newData)
    res.json({ success: true, cid })
  } catch (err) {
    console.error('Write error:', err)
    res.status(500).json({ error: 'Failed to sync data' })
  }
})

startNode()
  .then(() => app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Startup error:', err)
    process.exit(1)
  })
