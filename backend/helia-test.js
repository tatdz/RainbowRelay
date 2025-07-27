import process from 'process'
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { LevelBlockstore } from 'blockstore-level'
import { CID } from 'multiformats/cid'
import { decode } from 'multiformats/block'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'

import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'
import { ping } from '@libp2p/ping'

async function startLibp2p(listenAddrs) {
  const libp2p = await createLibp2p({
    addresses: { listen: listenAddrs || ['/ip4/0.0.0.0/tcp/0'] },
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

  await libp2p.start()

  libp2p.getMultiaddrs().forEach(addr => {
    console.log('🧭 Listening on:', addr.toString() + '/p2p/' + libp2p.peerId.toString())
  })

  return libp2p
}

async function main() {
  const [,, cidStr, remoteMultiaddr] = process.argv

  if (!cidStr || !remoteMultiaddr) {
    console.error('❌ Usage: node helia-test.js <CID> <remote-libp2p-multiaddr>')
    process.exit(1)
  }

  const libp2p = await startLibp2p()

  // Create Helia with empty LevelBlockstore (local store for retrieved data)
  const blockstore = new LevelBlockstore('./helia-teststore-db')
  const helia = await createHelia({ libp2p, blockstore })

  try {
    const cid = CID.parse(cidStr)
    // Try to fetch block from remote node via bitswap / DHT etc
    // But Helia doesn’t provide a built-in content routing or bitswap in this example.
    // So to actually get the block from remote, your node must have the data in local store
    // For demo, just attempt to get it locally here:
    const bytes = await helia.blockstore.get(cid)
    if (!bytes) throw new Error('Block not found in local blockstore')

    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
    const dataStr = new TextDecoder().decode(block.value)
    console.log('✅ Data fetched:', JSON.parse(dataStr))
  } catch (err) {
    console.error('Failed to fetch data:', err)
  }

  await libp2p.stop()
  process.exit(0)
}

main()
