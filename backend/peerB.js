import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { pipe } from 'it-pipe'
import { multiaddr } from '@multiformats/multiaddr'
import { Uint8ArrayList } from 'uint8arraylist'

const TEST_PROTOCOL = '/test/noise/1.0.0'

async function startPeer(targetMultiaddr) {
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: { identify: identify(), ping: ping() },
  })

  await libp2p.start()
  console.log('PeerB started with peerId:', libp2p.peerId.toString())
  // Print addresses without duplicating peerId: libp2p multiaddrs already include peerId if configured properly
  const listenAddrs = libp2p.getMultiaddrs().map(addr => addr.toString())
  console.log('Listening addresses:', listenAddrs)

  if (!targetMultiaddr) {
    console.error('Usage: node peerB.js <multiaddr-of-peerA>')
    process.exit(1)
  }

  try {
    console.log(`Dialing peerA at ${targetMultiaddr}`)
    const maddr = multiaddr(targetMultiaddr)
    const conn = await libp2p.dial(maddr)

    const result = await conn.newStream([TEST_PROTOCOL])
    // Some versions return { stream }, others return stream directly
    let stream
    if (result && typeof result === 'object' && 'stream' in result) {
      stream = result.stream
    } else {
      stream = result
    }

    if (!stream) {
      throw new Error('Failed to get stream from newStream()')
    }

    console.log('Stream opened, sending message...')

    // Pipe message either to sink (if available) or the stream directly
    if (stream.sink && typeof stream.sink === 'function') {
      await pipe([Buffer.from('Hello peerA!')], stream.sink)
    } else {
      await pipe([Buffer.from('Hello peerA!')], stream)
    }

    // Read reply
    for await (const msg of stream.source) {
      let bytes

      if (msg instanceof Uint8ArrayList) {
        bytes = msg.subarray()
      } else if (msg instanceof Uint8Array) {
        bytes = msg
      } else if (msg instanceof ArrayBuffer) {
        bytes = new Uint8Array(msg)
      } else {
        console.warn('Received unexpected reply format:', msg)
        continue
      }

      const decoded = new TextDecoder().decode(bytes)
      console.log('Received reply:', decoded)
    }

  } catch (err) {
    console.error('Connection or stream error:', err)
  }

  // Keep running long enough to maintain connection and receive replies
  setTimeout(async () => {
    await libp2p.stop()
    console.log('PeerB stopped')
    process.exit(0)
  }, 15000)
}

const targetMultiaddr = process.argv[2]
startPeer(targetMultiaddr).catch(console.error)
