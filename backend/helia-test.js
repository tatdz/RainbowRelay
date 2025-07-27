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

import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'

async function startLibp2p(listenAddrs) {
  const delegatedRouting = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

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
      delegatedRouting: () => delegatedRouting
    }
  })

  await libp2p.start()

  libp2p.getMultiaddrs().forEach(addr => {
    console.log('🧭 Listening on:', addr.toString() + '/p2p/' + libp2p.peerId.toString())
  })

  return { libp2p, delegatedRouting }
}

async function main() {
  const [,, cidStr, remoteMultiaddr] = process.argv

  if (!cidStr || !remoteMultiaddr) {
    console.error('❌ Usage: node helia-test.js <CID> <remote-libp2p-multiaddr>')
    process.exit(1)
  }

  const { libp2p, delegatedRouting } = await startLibp2p()

  const blockstore = new LevelBlockstore('./helia-teststore-db')
  const helia = await createHelia({ libp2p, blockstore })

  // Manually assign delegatedRouting as helia.contentRouting
  helia.contentRouting = delegatedRouting

  try {
    const cid = CID.parse(cidStr)
    // Try to fetch block from local store (remote fetch requires routing)
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
