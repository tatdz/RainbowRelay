const BACKEND_URL = process.env.REACT_APP_BACKEND_URL

export async function fetchOrders() {
  const res = await fetch(`${BACKEND_URL}/api/orders`)
  return res.json()
}

export async function fetchPeerReputations() {
  const res = await fetch(`${BACKEND_URL}/api/reputation/peers`)
  return res.json()
}

export async function submitOrder(order, poolName) {
  const res = await fetch(`${BACKEND_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order, poolName }),
  })
  return res.json()
}

export async function joinPool(poolName, peerId) {
  const res = await fetch(`${BACKEND_URL}/api/darkpools/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolName, peerId }),
  })
  return res.json()
}
