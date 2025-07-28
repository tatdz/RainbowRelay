import fetch from 'node-fetch'
import crypto from 'crypto'

const API_BASE = 'http://localhost:3000/api'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

// Encrypt order payload with AES-256-CTR zero IV
function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  return Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]).toString('hex')
}

// Decrypt order payload
function decryptOrder(encryptedHex, key) {
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString())
}

// Subscribe to a pubsub topic on backend via API
async function subscribeToTopic(topic) {
  console.log(`Subscribing to pubsub topic "${topic}" via backend API...`)
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  })
  if (!res.ok) {
    throw new Error(`Failed to subscribe to topic "${topic}": ${await res.text()}`)
  }
  const data = await res.json()
  console.log(`Subscription to topic "${topic}" successful:`, data)
  return data
}

// Join a dark pool by adding self to pool whitelist (this happens on backend on order post)
async function joinDarkPool(poolName) {
  console.log(`Joining dark pool '${poolName}' by posting a dummy order (adds to whitelist)...`)
  const dummyOrder = { id: `join-pool:${Date.now()}`, timestamp: Date.now() }
  const payload = { order: dummyOrder, poolName }

  if (ENCRYPTION_KEY) {
    payload.order = encryptOrder(dummyOrder, ENCRYPTION_KEY)
  }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Failed to join pool: ${await res.text()}`)
  }
  const data = await res.json()
  console.log(`Joined pool "${poolName}" result:`, data)

  // Now subscribe this client to the dark pool topic so it receives pubsub messages
  const topic = `darkpool/${poolName}`
  try {
    await subscribeToTopic(topic)
  } catch (err) {
    console.warn(`Warning: Could not subscribe to topic "${topic}":`, err.message)
  }
}

// Post private order to dark pool (encrypted)
async function postPrivateOrder(order, poolName) {
  const payload = { order, poolName }
  if (ENCRYPTION_KEY) {
    payload.order = encryptOrder(order, ENCRYPTION_KEY)
  }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Failed to post order: ${await res.text()}`)
  }
  const data = await res.json()
  console.log(`Posted private order to pool '${poolName}':`, data)
  return data
}

// Fetch and decrypt private orders from dark pool
async function fetchPrivateOrders(poolName) {
  const res = await fetch(`${API_BASE}/orders?pool=${encodeURIComponent(poolName)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch orders: ${await res.text()}`)
  }
  const encryptedOrders = await res.json()

  if (!ENCRYPTION_KEY) {
    console.warn('No ENCRYPTION_KEY set; returning encrypted orders')
    return encryptedOrders
  }

  // Decrypt each order if encrypted
  const decryptedOrders = encryptedOrders.map(o => {
    if (o.encrypted && o.data) {
      try {
        return decryptOrder(o.data, ENCRYPTION_KEY)
      } catch (e) {
        console.error('Error decrypting order:', e)
        return o
      }
    }
    return o
  })

  console.log(`Decrypted orders from pool '${poolName}':`, decryptedOrders)
  return decryptedOrders
}

async function getBackendSubscriptions() {
  // Optional: fetch current subscriptions from backend for diagnostics
  try {
    const res = await fetch(`${API_BASE}/subscriptions`)
    if (res.ok) {
      const subs = await res.json()
      console.log('Backend current subscriptions:', subs)
    } else {
      console.warn('Could not fetch backend subscriptions:', await res.text())
    }
  } catch (e) {
    console.warn('Error fetching backend subscriptions:', e.message)
  }
}

async function main() {
  try {
    const poolName = 'institutional-pool'
    await joinDarkPool(poolName)

    const order = {
      id: `privateOrder-${Date.now()}`,
      maker: '0x1234',
      taker: '0xabcd',
      quantity: 100,
      encrypted: !!ENCRYPTION_KEY,
      submittedAt: Date.now()
    }
    await postPrivateOrder(order, poolName)
    await fetchPrivateOrders(poolName)

    if (!ENCRYPTION_KEY) {
      console.log('No ENCRYPTION_KEY set; returning encrypted orders')
    }

    await getBackendSubscriptions()

    console.log('✅ Dark pool client operations completed successfully.')
  } catch (err) {
    console.error('❌ Dark pool client error:', err)
  }
}

main()
