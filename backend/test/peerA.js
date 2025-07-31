import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { mplex } from '@libp2p/mplex'
import { noise } from '@chainsafe/libp2p-noise'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { pipe } from 'it-pipe'
import { Uint8ArrayList } from 'uint8arraylist'

const TEST_PROTOCOL = '/test/noise/1.0.0'

async function startPeer() {
  const libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] }, // Listen on random available port
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: { identify: identify(), ping: ping() },
  })

  libp2p.handle(TEST_PROTOCOL, async ({ stream, connection }) => {
    console.log(`Received incoming connection from ${connection.remotePeer.toString()}`)

    for await (const msg of stream.source) {
      let bytes

      if (msg instanceof Uint8ArrayList) {
        bytes = msg.subarray()
      } else if (msg instanceof Uint8Array) {
        bytes = msg
      } else {
        console.warn('Received unexpected message format:', msg)
        continue
      }

      const decoded = new TextDecoder().decode(bytes)
      console.log(`Received message: ${decoded}`)

      // Echo back the message immediately
      await pipe([Buffer.from(`Hello back, you said: ${decoded}`)], stream.sink)
    }
  })

  await libp2p.start()

  console.log('PeerA started with peerId:', libp2p.peerId.toString())
  // Print listen addresses without duplicated peerId
  const listenAddrs = libp2p.getMultiaddrs().map(addr => addr.toString())
  console.log('Listening addresses:', listenAddrs)

  // Keep running to accept incoming connections
  return libp2p
}

startPeer().catch(console.error)
