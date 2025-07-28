import fetch from 'node-fetch'
import crypto from 'crypto'

const API_BASE = 'http://localhost:3000/api'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

// Encrypt if key present, matching backend AES-256-CTR encryption
function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()])
  return encrypted.toString('hex')
}

async function postOrderToDarkPool(order, poolName) {
  const payload = { order, poolName }
  if (ENCRYPTION_KEY) {
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
  console.log(`✅ Order posted to dark pool '${poolName}':`, data)
  return data
}

async function getOrdersFromDarkPool(poolName) {
  const res = await fetch(`${API_BASE}/orders?pool=${encodeURIComponent(poolName)}`, {
    method: 'GET'
  })

  if (!res.ok) {
    const errData = await res.json()
    throw new Error(`GET /orders (pool=${poolName}) failed: ${JSON.stringify(errData)}`)
  }

  const orders = await res.json()
  console.log(`📝 Orders retrieved from dark pool '${poolName}':`, orders)
  return orders
}

async function main() {
  try {
    const poolName = 'institutional-pool'
    const timestamp = Date.now()

    const testOrder = {
      id: `darkOrder-${timestamp}`,
      item: 'PrivateWidget',
      quantity: 42,
      submittedAt: timestamp,
      encrypted: !!ENCRYPTION_KEY,
    }

    console.log(`Posting order to dark pool '${poolName}'...`)
    await postOrderToDarkPool(testOrder, poolName)

    console.log(`Fetching orders from dark pool '${poolName}'...`)
    await getOrdersFromDarkPool(poolName)

    console.log('✅ Dark pool test completed successfully.')
  } catch (err) {
    console.error('❌ Dark pool test script error:', err)
  }
}

main()
