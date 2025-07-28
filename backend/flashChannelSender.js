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
import { multiaddr } from '@multiformats/multiaddr'
import readline from 'readline'

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

  const listenAddrs = libp2p.getMultiaddrs().map(addr => addr.toString())
  listenAddrs.forEach(addr => {
    console.log('🧭 Listening on:', addr)
  })

  return libp2p
}

/**
 * Sends a single flash message on a fresh stream to the given peer multiaddr
 * @param {*} libp2p - libp2p node instance
 * @param {string} peerMultiaddr - multiaddr string of the target peer
 * @param {string} message - raw message string to send
 */
async function sendFlashMessage(libp2p, peerMultiaddr, message) {
  try {
    console.log(`Dialing peer and opening flash channel: ${peerMultiaddr}`)
    const maddr = multiaddr(peerMultiaddr)
    const connection = await libp2p.dial(maddr)

    const result = await connection.newStream([FLASH_PROTOCOL])
    let stream
    // Support both result streams or { stream } object
    if (result && typeof result === 'object' && 'stream' in result) {
      stream = result.stream
    } else {
      stream = result
    }

    if (!stream) {
      throw new Error('Failed to obtain stream from newStream()')
    }

    console.log('⚡ Flash channel stream opened')
    try {
      console.log('Stream keys:', Object.keys(stream))
    } catch {}

    if (stream.sink && typeof stream.sink === 'function') {
      await pipe([Buffer.from(message)], stream.sink)
    } else {
      await pipe([Buffer.from(message)], stream)
    }

    console.log('⚡ Flash message sent:', message)

    if (stream.close && typeof stream.close === 'function') {
      await stream.close()
      console.log('⚡ Stream closed cleanly')
    }
  } catch (err) {
    console.error('❌ Failed to send flash message:', err)
  }
}

/**
 * Sets up an interactive prompt to send multiple flash messages from stdin.
 * Ends and cleans up on SIGINT.
 */
async function interactiveMessagePrompt(libp2p, targetMultiaddr) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'Enter flash message (or "exit" to quit): ',
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }
    if (trimmed.toLowerCase() === 'exit') {
      console.log('Exit command received. Shutting down...')
      rl.close()
      return
    }
    await sendFlashMessage(libp2p, targetMultiaddr, trimmed)
    rl.prompt()
  })

  rl.on('close', async () => {
    try {
      await libp2p.stop()
      console.log('Libp2p stopped. Exiting.')
      process.exit(0)
    } catch (err) {
      console.error('Error during shutdown:', err)
      process.exit(1)
    }
  })

  // Handle SIGINT to close readline gracefully
  process.on('SIGINT', () => {
    console.log('\nSIGINT received. Exiting...')
    rl.close()
  })
}

async function main() {
  const [, , targetMultiaddr, ...msgParts] = process.argv

  if (!targetMultiaddr) {
    console.error('Usage: node flashChannelSender.js <peerMultiaddr> [initialMessage]')
    process.exit(1)
  }

  const initialMessage = msgParts.length > 0
    ? msgParts.join(' ')
    : JSON.stringify({ type: 'fill', orderId: '123', status: 'completed' })

  const libp2p = await startLibp2p()

  // Send initial message once before starting prompt
  if (initialMessage) {
    await sendFlashMessage(libp2p, targetMultiaddr, initialMessage)
  }

  // Enter interactive mode for multiple messages
  await interactiveMessagePrompt(libp2p, targetMultiaddr)
}

main()
