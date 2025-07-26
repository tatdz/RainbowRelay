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

import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'

async function testHelia() {
  console.log('Starting libp2p node...')

  // Delegated routing client instance
  const delegatedRouting = createDelegatedRoutingV1HttpApiClient('https://delegated-ipfs.dev')

  // Create libp2p node with delegatedRouting instance passed as service
  const libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      delegatedRouting, // directly pass the service instance here
    },
  })

  await libp2pNode.start()
  console.log('libp2p started with peerId:', libp2pNode.peerId.toString())

  await new Promise(resolve => setTimeout(resolve, 100))

  // Use LevelDB blockstore for Helia
  const blockstore = new LevelBlockstore('./helia-blockstore-db')

  // Create Helia with libp2p node and delegatedRouting as contentRouting
  const heliaNode = await createHelia({
    libp2p: libp2pNode,
    blockstore,
    contentRouting: delegatedRouting,
  })

  if (!heliaNode.contentRouting) {
    console.warn('Warning: heliaNode.contentRouting is undefined.')
  } else {
    console.log('Helia contentRouting enabled.')
  }

  // Encode IPLD dag-cbor block with "hello world"
  const block = await Block.encode({
    value: 'hello world',
    codec: dagCbor,
    hasher: sha256,
  })

  // Store block in Helia blockstore
  const cid = await heliaNode.blockstore.put(block.cid, block.bytes)
  console.log('Stored block with CID:', cid.toString())

  // Provide block content on the network
  if (heliaNode.contentRouting?.provide) {
    try {
      await heliaNode.contentRouting.provide(cid)
      console.log('Content provided on network.')
    } catch (err) {
      console.warn('Failed to provide content:', err)
    }
  } else {
    console.warn('contentRouting.provide() not available.')
  }

  // Close LevelDB cleanly
  try {
    if (heliaNode.blockstore.child?.child?.close) {
      await heliaNode.blockstore.child.child.close()
      console.log('LevelDB closed successfully.')
    }
  } catch (err) {
    console.warn('Error closing LevelDB:', err)
  }

  await heliaNode.stop()
  await libp2pNode.stop()
  console.log('Helia and libp2p nodes stopped. Test complete.')
}

testHelia().catch(err => {
  console.error('Helia test failed:', err)
  process.exit(1)
})
