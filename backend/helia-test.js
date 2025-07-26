// helia-test.js
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'

import { LevelBlockstore } from 'blockstore-level'
import { createDelegatedRoutingV1HttpApiClient } from '@helia/delegated-routing-v1-http-api-client'
import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'

async function testHelia() {
  console.log('Starting libp2p...')

  const delegatedClient = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      delegatedRouting: () => delegatedClient
    }
  })

  await libp2p.start()
  console.log('Libp2p started with peerId:', libp2p.peerId.toString())

  const blockstore = new LevelBlockstore('./helia-test-db')
  const helia = await createHelia({ libp2p, blockstore })
  console.log('Helia contentRouting:', helia.contentRouting ? '✅ available' : '❌ undefined')

  const block = await Block.encode({
    value: 'test-data',
    codec: dagCbor,
    hasher: sha256
  })
  await helia.blockstore.put(block.cid, block.bytes)
  console.log('Stored CID:', block.cid.toString())

  if (helia.contentRouting?.provide) {
    try {
      await helia.contentRouting.provide(block.cid)
      console.log('Successfully provided CID via delegated routing')
    } catch (err) {
      console.error('Provide failed:', err)
    }
  } else {
    console.warn('contentRouting.provide() is not available.')
  }

  await helia.stop()
  await libp2p.stop()
  console.log('Test complete.')
}

testHelia().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
