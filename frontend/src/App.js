import React, { useEffect, useState } from 'react'
import OrderForm from './components/OrderForm'
import ReputationList from './components/ReputationList'
import DarkPoolManager from './components/DarkPoolManager'
import { ethers } from 'ethers'

const BACKEND_URLS = [
  process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000',
  // Add more backend URLs for multi-node testing
  // 'http://localhost:3001',
]

function App() {
  const [peerId, setPeerId] = useState('')
  const [orders, setOrders] = useState([])
  const [orderStatuses, setOrderStatuses] = useState({})

  // Get connected wallet address as peerId
  useEffect(() => {
    const getPeerId = async () => {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const signer = await provider.getSigner()
        setPeerId(await signer.getAddress())
      }
    }
    getPeerId()
  }, [])

  // Fetch orders from multiple backends and merge
  async function fetchFromBackends() {
    try {
      const results = await Promise.all(
        BACKEND_URLS.map(async (url) => {
          try {
            const res = await fetch(`${url}/api/orders`)
            if (!res.ok) throw new Error('Failed to fetch')
            return res.json()
          } catch {
            return []
          }
        })
      )
      const merged = {}
      for (const list of results) {
        for (const o of list) {
          const key = JSON.stringify(o.order || o)
          merged[key] = o
        }
      }
      setOrders(Object.values(merged))
    } catch (e) {
      console.error('Fetch from backends error', e)
    }
  }

  useEffect(() => {
    fetchFromBackends()
    const interval = setInterval(fetchFromBackends, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch order statuses
  useEffect(() => {
    orders.forEach(async (o) => {
      try {
        const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(o)))
        for (const backendUrl of BACKEND_URLS) {
          try {
            const res = await fetch(`${backendUrl}/api/order-status/${hash}`)
            if (res.ok) {
              const status = await res.json()
              setOrderStatuses((prev) => ({ ...prev, [hash]: status }))
              break
            }
          } catch {}
        }
      } catch (e) {
        console.error('Error fetching order status:', e)
      }
    })
  }, [orders])

  return (
    <div style={{ maxWidth: 700, margin: 'auto', padding: 20 }}>
      <h1>PonyHof — Private Dark Pools & Reputation Overlay for 1inch</h1>
      {peerId ? <p>Connected wallet: {peerId.slice(0, 12)}...</p> : <p>Connect your wallet to start</p>}
      <OrderForm peerId={peerId} />
      <DarkPoolManager peerId={peerId} />
      <ReputationList />
      <h2>Live Orders</h2>
      <ul>
        {orders.length === 0 && <li>No orders</li>}
        {orders.map((o, i) => {
          if (o.encrypted) return <li key={i}>[Encrypted Order]</li>
          const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(o)))
          const status = orderStatuses[hash] || {}
          return (
            <li key={i}>
              Maker: {o.order?.maker?.slice(0, 6)}... | MakerAsset: {o.order?.makerAsset} | Amount:{' '}
              {ethers.utils.formatUnits(o.order?.makingAmount || '0', 18)}<br />
              Status: {status.fill ? `Filled (tx: ${status.fill.txHash?.slice(0, 10)}...)` : 'Open'}{' '}
              {status.cancel ? `| Cancelled (tx: ${status.cancel.txHash?.slice(0, 10)}...)` : ''}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default App
