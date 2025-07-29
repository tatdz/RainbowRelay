import React, { useEffect, useState } from 'react'
import OrderForm from './components/OrderForm'
import ReputationList from './components/ReputationList'
import DarkPoolManager from './components/DarkPoolManager'

import { ethers } from 'ethers'

function App() {
  const [peerId, setPeerId] = useState('')

  useEffect(() => {
    async function getPeerId() {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const signer = await provider.getSigner()
        setPeerId(await signer.getAddress())
      }
    }
    getPeerId()
  }, [])

  return (
    <div style={{ maxWidth: 700, margin: 'auto', padding: 20 }}>
      <h1>PonyHof — Private Dark Pools & Reputation Overlay for 1inch</h1>
      {peerId ? <p>Connected wallet: {peerId.slice(0, 12)}...</p> : <p>Connect your wallet to start</p>}
      <OrderForm peerId={peerId} />
      <DarkPoolManager peerId={peerId} />
      <ReputationList />
    </div>
  )
}

export default App
