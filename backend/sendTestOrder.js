import fetch from 'node-fetch'
import crypto from 'crypto'

const API_BASE = 'http://localhost:3000/api'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || 'defaultsecret'
// Derive 32-byte key from passphrase using SHA-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()

// Encryption helper matching your backend AES-256-CTR with zero IV
function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv(
    'aes-256-ctr',
    key,
    Buffer.alloc(16, 0) // zero IV
  )
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()])
  return encrypted.toString('hex')
}

async function postSingleOrder(order) {
  const payload = { order }

  if (ENCRYPTION_SECRET) {
    payload.order = encryptOrder(order, ENCRYPTION_KEY)
  }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`POST /orders failed: ${JSON.stringify(data)}`)
  }
  console.log('✅ Single order posted:', data)
  return data
}

async function postBatchOrders(orders) {
  const payload = { orders }
  // Batch orders posted as plain JSON array (your backend syncs this to IPFS)

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`POST /orders batch failed: ${JSON.stringify(data)}`)
  }
  console.log('✅ Batch orders posted, CID:', data.cid)
  return data.cid
}

async function getOrders() {
  const res = await fetch(`${API_BASE}/orders`, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`GET /orders failed with status ${res.status}`)
  }
  const orders = await res.json()
  console.log('📝 Current orders:', orders)
  return orders
}

async function getOrdersByCID(cid) {
  const res = await fetch(`${API_BASE}/orders/${cid}`, { method: 'GET' })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(`GET /orders/${cid} failed: ${JSON.stringify(error)}`)
  }
  const orders = await res.json()
  console.log(`📝 Orders retrieved by CID (${cid}):`, orders)
  return orders
}

async function main() {
  try {
    const timestamp = Date.now()

    // Prepare a detailed single order payload, similar to your old structure
    const singleOrder = {
      makerAsset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC token
      takerAsset: '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI token
      maker: '0x1234567890abcdef1234567890abcdef12345678',      // example maker address
      signature: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
      metadata: {
        submittedAt: Math.floor(timestamp / 1000),
      },
      encrypted: !!ENCRYPTION_SECRET,
      id: `order-${timestamp}`,
    }

    console.log('\n🔹 Posting single order...')
    await postSingleOrder(singleOrder)

    // Prepare batch orders array with unique IDs
    const batchOrders = [
      { id: `batch1-${timestamp}`, item: 'foo', quantity: 10 },
      { id: `batch2-${timestamp}`, item: 'bar', quantity: 20 },
    ]

    console.log('\n🔹 Posting batch orders...')
    const cid = await postBatchOrders(batchOrders)

    console.log('\n🔹 Fetching all current orders...')
    await getOrders()

    console.log('\n🔹 Fetching batch orders by CID...')
    await getOrdersByCID(cid)

    console.log('\n🟢 All tests completed successfully.')

  } catch (error) {
    console.error('\n❌ Test script error:', error)
  }
}

main()
