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
import { kadDHT } from '@libp2p/kad-dht'
import { createBitswap } from '@helia/bitswap'

async function startLibp2p(listenAddrs) {
  const libp2p = await createLibp2p({
    addresses: { listen: listenAddrs || ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()], // <-- here we use connectionEncrypters as requested
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        emitSelf: false,
      }),
      mdns: mdns({ interval: 10000 }),
      dht: kadDHT({
        enabled: true,
        randomWalk: {
          enabled: true,
        },
      }),
    },
    connectionManager: {
      minConnections: 1,
      maxConnections: 10,
      autoDial: false,
    },
  })

  await libp2p.start()
  console.log('✅ libp2p node started with peerId:', libp2p.peerId.toString())
  libp2p.getMultiaddrs().forEach(addr => {
    console.log('🧭 Listening on:', addr.toString() + '/p2p/' + libp2p.peerId.toString())
  })

  // Start DHT explicitly
  if (libp2p.services?.dht) {
    await libp2p.services.dht.start()
    console.log('✅ KadDHT started')
  }

  return libp2p
}

async function main() {
  const [,, cidStr, remoteMultiaddr] = process.argv

  // Start libp2p node
  const libp2p = await startLibp2p()

  // LevelDB blockstore
  const blockstore = new LevelBlockstore('./helia-teststore-db')

  // Create Bitswap connected to libp2p and blockstore
  const bitswap = await createBitswap({
    libp2p,
    blockstore,
    logger: {
      forComponent: () => ({
        debug: (...args) => console.debug('[Bitswap]', ...args),
        info: (...args) => console.info('[Bitswap]', ...args),
        warn: (...args) => console.warn('[Bitswap]', ...args),
        error: (...args) => console.error('[Bitswap]', ...args),
      }),
    }
  })

  // Create Helia with bitswap and libp2p node
  const helia = await createHelia({
    libp2p,
    blockstore,
    bitswap,
  })

  // Assign KadDHT for content routing to Helia (for provide/find)
  if (libp2p.services?.dht) {
    helia.contentRouting = libp2p.services.dht
    console.log('✅ Helia content routing assigned from libp2p KadDHT')
  } else {
    console.warn('⚠️ No KadDHT service found to assign for Helia content routing')
  }

  // Subscribe to 'orders' pubsub topic and log messages
  await libp2p.services.pubsub.subscribe('orders')
  libp2p.services.pubsub.addEventListener('message', evt => {
    try {
      const message = new TextDecoder().decode(evt.detail.data)
      console.log(`📦 Received pubsub message on 'orders':`, message)
    } catch (e) {
      console.error('Error decoding pubsub message', e)
    }
  })
  console.log('✅ Subscribed to pubsub topic "orders"')

  // If remoteMultiaddr provided, attempt to dial and fetch data by CID
  if (cidStr && remoteMultiaddr) {
    try {
      const peerMultiaddr = remoteMultiaddr
      console.log(`🔌 Dialing remote peer at ${peerMultiaddr}...`)
      await libp2p.dial(new URL(peerMultiaddr.replace('/p2p/', '/')))

      console.log(`Fetching block with CID ${cidStr} via helia.blockstore.get`)
      const cid = CID.parse(cidStr)
      // Attempt to fetch block from network via Bitswap/DHT
      const bytes = await helia.blockstore.get(cid)

      if (!bytes) {
        console.log("❗ Block not found in local store")
      } else {
        const block = await decode({ cid, bytes, codec: raw, hasher: sha256 })
        const dataStr = new TextDecoder().decode(block.value)
        console.log('✅ Fetched block data:', JSON.parse(dataStr))
      }
    } catch (err) {
      console.error('❌ Failed to fetch remote block or dial peer:', err)
    }
  } else {
    console.log('ℹ️ No CID and/or remote multiaddr provided; skipping remote fetch')
  }

  // Put some sample data into the blockstore and retrieve it back
  try {
    const sampleString = `Hello at ${new Date().toISOString()}`
    const dataBytes = new TextEncoder().encode(sampleString)
    const block = await encode({ value: dataBytes, codec: raw, hasher: sha256 })
    await helia.blockstore.put(block.cid, block.bytes)
    console.log('✅ Stored sample data block with CID:', block.cid.toString())

    // Retrieve & decode
    const retrievedBytes = await helia.blockstore.get(block.cid)
    if (retrievedBytes) {
      const retrievedBlock = await decode({ cid: block.cid, bytes: retrievedBytes, codec: raw, hasher: sha256 })
      const decodedString = new TextDecoder().decode(retrievedBlock.value)
      console.log('✅ Successfully retrieved stored block:', decodedString)
    } else {
      console.warn('⚠️ Block not found after storing')
    }
  } catch (err) {
    console.error('❌ Error storing or retrieving data block:', err)
  }

  // Graceful shutdown on SIGINT
  process.on('SIGINT', async () => {
    console.log('⚙️ Graceful shutdown initiated...')
    try {
      await libp2p.stop()
      console.log('✅ libp2p stopped')
      process.exit(0)
    } catch (err) {
      console.error('❌ Error during shutdown:', err)
      process.exit(1)
    }
  })
}

// Run main()
main().catch(err => {
  console.error('❌ Unhandled error in test:', err)
  process.exit(1)
})
