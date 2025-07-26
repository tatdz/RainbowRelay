// helia-test.js
import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { LevelBlockstore } from 'blockstore-level'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { encode, decode } from 'multiformats/block'

// libp2p modules
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { mdns } from '@libp2p/mdns'

async function createNode() {
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 })
    }
  })

  console.log('Starting libp2p...')
  await libp2p.start()
  console.log('Libp2p peerId:', libp2p.peerId.toString())

  const blockstore = new LevelBlockstore('./helia-blockstore-db')
  const helia = await createHelia({ libp2p, blockstore })

  console.log('Helia contentRouting:', helia.contentRouting ? '✔️ enabled' : '❌ undefined')

  return { helia, libp2p }
}

async function heliaTest() {
  const { helia, libp2p } = await createNode()

  try {
    const data = new TextEncoder().encode('Hello from Helia test!')
    const block = await encode({ value: data, codec: raw, hasher: sha256 })

    await helia.blockstore.put(block.cid, block.bytes)
    console.log('✅ Block stored with CID:', block.cid.toString())

    const resultBytes = await helia.blockstore.get(block.cid)
    const resultBlock = await decode({ cid: block.cid, bytes: resultBytes, codec: raw, hasher: sha256 })
    const decoded = new TextDecoder().decode(resultBlock.value)
    console.log('✅ Block retrieved:', decoded)
  } catch (err) {
    console.error('Error in heliaTest:', err)
  } finally {
    await libp2p.stop()
    await helia.stop()
    console.log('Helia and libp2p nodes stopped. Test complete.')
  }
}

heliaTest()
