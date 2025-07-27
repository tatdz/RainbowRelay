import fs from 'fs/promises'
import process from 'process'
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

const CID_FILE = './latest-cid.txt'

async function loadCIDFromFile() {
  try {
    const cid = await fs.readFile(CID_FILE, 'utf8')
    return cid.trim()
  } catch {
    return null
  }
}

async function startNode() {
  const libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
    }
  })

  await libp2pNode.start()

  libp2pNode.getMultiaddrs().forEach(addr => {
    console.log('Listening on:', addr.toString() + '/p2p/' + libp2pNode.peerId.toString())
  })

  const blockstore = new LevelBlockstore('./helia-blockstore-db')
  const heliaNode = await createHelia({ libp2p: libp2pNode, blockstore })

  return { heliaNode, libp2pNode }
}

async function main() {
  let [,, cidArg, multiaddr] = process.argv

  if (!cidArg || !multiaddr) {
    cidArg = await loadCIDFromFile()
    if (!cidArg) {
      console.error('❌ Usage: node helia-test.js <CID> <multiaddr>')
      process.exit(1)
    }
    console.log(`ℹ️ Loaded CID from file: ${cidArg}`)
    console.log(`ℹ️ You must still provide multiaddr as second argument.`)
    console.log('Usage: node helia-test.js <CID> <multiaddr>')
    process.exit(1)
  }

  const { heliaNode, libp2pNode } = await startNode()

  try {
    const cid = CID.parse(cidArg)
    const bytes = await heliaNode.blockstore.get(cid)
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    const dataStr = new TextDecoder().decode(block.value)
    console.log('✅ Data fetched from Helia IPFS:', JSON.parse(dataStr))
  } catch (err) {
    console.error('Failed to fetch data from IPFS:', err)
  }

  await libp2pNode.stop()
  process.exit(0)
}

main()
