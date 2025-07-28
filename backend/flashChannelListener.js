import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { mdns } from '@libp2p/mdns'
import { kadDHT } from '@libp2p/kad-dht'
import { pipe } from 'it-pipe'

const FLASH_PROTOCOL = '/orders/flash/1.0.0'

async function startLibp2p() {
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      dht: kadDHT({ enabled: true, randomWalk: { enabled: true } }),
    },
    connectionManager: { minConnections: 1, maxConnections: 10, autoDial: false },
  })

  await libp2p.start()
  console.log('✅ libp2p node started with peerId:', libp2p.peerId.toString())
  libp2p.getMultiaddrs().forEach(addr => {
    console.log('🧭 Listening on:', addr.toString() + '/p2p/' + libp2p.peerId.toString())
  })

  // Handle incoming flash channel streams
  libp2p.handle(FLASH_PROTOCOL, async ({ stream, connection }) => {
    const peerId = connection.remotePeer.toString()
    console.log(`⚡ Flash channel opened from peer ${peerId}`)

    try {
      for await (const chunk of stream.source) {
        const message = new TextDecoder().decode(chunk)
        console.log(`⚡ Flash channel message from ${peerId}:`, message)
      }
    } catch (err) {
      console.error(`⚡ Flash channel error with peer ${peerId}:`, err)
    }
    console.log(`⚡ Flash channel closed for peer ${peerId}`)
  })

  return libp2p
}

async function openFlashChannelToPeer(libp2p, peerMultiaddr) {
  try {
    console.log(`Dialing peer and opening flash channel stream: ${peerMultiaddr}`)
    const conn = await libp2p.dial(peerMultiaddr)
    const { stream } = await conn.newStream([FLASH_PROTOCOL])
    console.log('⚡ Flash channel stream opened')

    // Listen for flash channel messages (if peer sends any)
    try {
      for await (const chunk of stream.source) {
        const message = new TextDecoder().decode(chunk)
        console.log('⚡ Received flash message:', message)
      }
    } catch (err) {
      console.error('⚡ Flash channel read error:', err)
    }
  } catch (err) {
    console.error('Failed to open flash channel:', err)
  }
}

async function main() {
  const [,, targetMultiaddr] = process.argv

  const libp2p = await startLibp2p()

  if (targetMultiaddr) {
    await openFlashChannelToPeer(libp2p, targetMultiaddr)
  } else {
    console.log('No target multiaddr provided. Listening for incoming flash channel connections...')
  }

  // Keep node running
  process.stdin.resume()

  process.on('SIGINT', async () => {
    console.log('Shutting down libp2p node...')
    await libp2p.stop()
    process.exit(0)
  })
}

main()
