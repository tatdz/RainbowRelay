import fetch from 'node-fetch'
import crypto from 'crypto'

const API_BASE = 'http://localhost:3000/api'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

/**
 * Encrypt the order object with AES-256-CTR using the provided key.
 * Returns a hex-encoded string of ciphertext.
 * Must match encryption on backend.
 */
function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()])
  return encrypted.toString('hex')
}

/**
 * Post a single order to the backend API dark pool endpoint.
 * If encryption key is set, encrypts the order before sending.
 * @param {Object} order - Order object
 * @param {string} pool - Pool name string
 */
async function postOrderToDarkPool(order, pool) {
  const payload = { pool }

  if (ENCRYPTION_KEY) {
    // Encrypt order as hex string
    payload.order = encryptOrder(order, ENCRYPTION_KEY)
  } else {
    // Send plain object
    payload.order = order
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
  console.log(`✅ Order posted to dark pool '${pool}':`, data)
  return data
}

/**
 * Fetch orders from the backend API dark pool endpoint.
 * @param {string} pool - Pool name string
 */
async function getOrdersFromDarkPool(pool) {
  const url = `${API_BASE}/orders?pool=${encodeURIComponent(pool)}`
  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const errorData = await res.json()
    throw new Error(`GET /orders (pool=${pool}) failed: ${JSON.stringify(errorData)}`)
  }

  const orders = await res.json()
  console.log(`📝 Orders retrieved from dark pool '${pool}':`, orders)
  return orders
}

async function main() {
  try {
    const pool = 'institutional-pool'
    const timestamp = Date.now()

    // Example test order object
    const testOrder = {
      id: `darkOrder-${timestamp}`,
      item: 'PrivateWidget',
      quantity: 42,
      submittedAt: timestamp,
      encrypted: !!ENCRYPTION_KEY, // Just metadata to indicate encryption status
    }

    console.log(`Posting order to dark pool '${pool}'...`)
    await postOrderToDarkPool(testOrder, pool)

    console.log(`Fetching orders from dark pool '${pool}'...`)
    await getOrdersFromDarkPool(pool)

    console.log('✅ Dark pool test completed successfully.')
  } catch (err) {
    console.error('❌ Dark pool test script error:', err)
  }
}

main()
