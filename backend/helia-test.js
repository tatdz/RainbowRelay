import { createHelia } from 'helia'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { unixfs } from '@helia/unixfs'
import { createBitswap } from '@helia/bitswap'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import { CID } from 'multiformats/cid'

const [,, cidStr, multiaddrStr] = process.argv

if (!cidStr || !multiaddrStr) {
  console.error('❌ Usage: node helia-test.js <CID> <multiaddr>')
  process.exit(1)
}

async function main() {
  // 1. Create libp2p
  const libp2p = await createLibp2p({
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    services: {
      identify: identify(),
      ping: ping()
    }
  })

  // 2. Create helia
  const helia = await createHelia({ libp2p })

  // 3. Create bitswap with helia components
  const bitswap = createBitswap(helia._libp2p.components)

  // 4. Register bitswap manually
  helia._libp2p.services.bitswap = bitswap

  const fs = unixfs(helia)

  console.log(`✅ Test node started with peerId: ${libp2p.peerId.toString()}`)
  console.log(`🔍 Fetching CID: ${cidStr}`)
  console.log(`🔌 Dialing backend node at ${multiaddrStr} with protocol /ipfs/bitswap/1.2.0`)

  try {
    await libp2p.dial(multiaddrStr)
    const cid = CID.parse(cidStr)
    const file = await fs.cat(cid)

    let content = ''
    for await (const chunk of file) {
      content += uint8ArrayToString(chunk)
    }

    console.log('✅ Retrieved content:')
    console.log(content)
  } catch (err) {
    console.error('❌ Failed to fetch content:', err)
  }

  await helia.stop()
}

main()
