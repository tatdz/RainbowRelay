import fetch from 'node-fetch'
import crypto from 'crypto'

const API_BASE = 'http://localhost:3000/api'
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null

function encryptOrder(order, key) {
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16,0))
  return Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]).toString('hex')
}

function decryptOrder(encryptedHex, key) {
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.alloc(16,0))
  const decryptedBuffer = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return JSON.parse(decryptedBuffer.toString())
}

function testEncryptionRoundtrip() {
  if (!ENCRYPTION_KEY) {
    console.log('⚠️ ENCRYPTION_KEY not set; skipping local test.')
    return
  }
  const testOrder = {
    id: 'testOrder-' + Date.now(),
    maker: '0xTestMaker',
    taker: '0xTestTaker',
    quantity: 42,
    submittedAt: Date.now(),
  }
  console.log('🔐 Testing local encryption/decryption roundtrip:', testOrder)
  const encrypted = encryptOrder(testOrder, ENCRYPTION_KEY)
  console.log('Encrypted hex:', encrypted)
  const decrypted = decryptOrder(encrypted, ENCRYPTION_KEY)
  console.log('Decrypted order:', decrypted)
  const success = JSON.stringify(testOrder) === JSON.stringify(decrypted)
  console.log(`Encryption roundtrip successful: ${success ? '✅' : '❌'}`)
  if (!success) throw new Error('Local encryption/decryption test failed.')
}

async function subscribeToTopic(topic) {
  console.log(`➡️ Subscribing to topic "${topic}" via backend API...`)
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to subscribe to topic "${topic}": ${text}`)
  }
  const data = await res.json()
  console.log(`✅ Subscribed to topic "${topic}":`, data)
  return data
}

async function joinDarkPool(pool) {
  console.log(`Joining dark pool "${pool}" by posting dummy join order...`)
  const dummyOrder = {
    id: `join-pool:${Date.now()}`,
    timestamp: Date.now(),
    submittedAt: Date.now(),
  }

  // Wrap the encrypted order in envelope so backend recognizes it
  let orderPayload = dummyOrder
  if (ENCRYPTION_KEY) {
    orderPayload = {
      encrypted: true,
      data: encryptOrder(dummyOrder, ENCRYPTION_KEY),
      pool
    }
  }

  const payload = { pool, order: orderPayload }

  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to join pool: ${text}`)
  }

  const data = await res.json()
  console.log('Join pool response:', data)

  // Subscribe client to pool pubsub topic
  try {
    await subscribeToTopic(`darkpool/${pool}`)
  } catch (err) {
    console.warn(`⚠️ Could not subscribe to topic "darkpool/${pool}": ${err.message}`)
  }
}

async function postPrivateOrder(order, pool) {
  let orderPayload = order
  if (ENCRYPTION_KEY) {
    orderPayload = {
      encrypted: true,
      data: encryptOrder(order, ENCRYPTION_KEY),
      pool
    }
  }
  const payload = { pool, order: orderPayload }

  console.log(`Posting private order to pool "${pool}"...`)
  const res = await fetch(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to post private order: ${text}`)
  }
  const data = await res.json()
  console.log('Private order post response:', data)
  return data
}

async function fetchPrivateOrders(pool) {
  console.log(`Fetching private orders from pool "${pool}"...`)
  const res = await fetch(`${API_BASE}/orders?pool=${encodeURIComponent(pool)}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to fetch orders: ${text}`)
  }
  const orders = await res.json()

  if (!ENCRYPTION_KEY) {
    console.log('⚠️ No encryption key set; returning orders as-is (may be encrypted)')
    return orders
  }

  const decryptedOrders = orders.map(o => {
    if (typeof o === 'string') {
      try {
        return decryptOrder(o, ENCRYPTION_KEY)
      } catch (e) {
        console.error('Failed to decrypt string order:', e)
        return o
      }
    }
    if (o?.encrypted && o?.data) {
      try {
        return decryptOrder(o.data, ENCRYPTION_KEY)
      } catch (e) {
        console.error('Failed to decrypt order envelope:', e)
        return o
      }
    }
    return o
  })

  console.log(`🔓 Decrypted orders from pool "${pool}":`, decryptedOrders)
  return decryptedOrders
}

async function getBackendSubscriptions() {
  try {
    const res = await fetch(`${API_BASE}/subscriptions`)
    if (res.ok) {
      const subs = await res.json()
      console.log('Backend subscriptions:', subs)
    } else {
      const text = await res.text()
      console.warn('Failed to get backend subscriptions:', text)
    }
  } catch (e) {
    console.warn('Error retrieving subscriptions:', e.message)
  }
}

async function main() {
  try {
    if (ENCRYPTION_KEY) {
      testEncryptionRoundtrip()
    } else {
      console.log('⚠️ ENCRYPTION_KEY not set; running in plaintext mode.')
    }

    const pool = 'institutional-pool'

    await joinDarkPool(pool)

    const newOrder = {
      id: `privateOrder-${Date.now()}`,
      maker: '0x1234',
      taker: '0xabcd',
      quantity: 100,
      encrypted: !!ENCRYPTION_KEY,
      submittedAt: Date.now(),
    }

    await postPrivateOrder(newOrder, pool)
    await fetchPrivateOrders(pool)
    await getBackendSubscriptions()

    console.log('✅ Dark pool client workflows done.')
  } catch (err) {
    console.error('❌ Dark pool client error:', err)
  }
}

main()
