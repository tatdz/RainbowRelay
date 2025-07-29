import React, { useState } from 'react'
import { ethers } from 'ethers'
import { signOrder } from '../utils'
import { submitOrder } from '../api'

export default function OrderForm({ peerId }) {
  const [makerToken, setMakerToken] = useState('')
  const [takerToken, setTakerToken] = useState('')
  const [makerAmount, setMakerAmount] = useState('')
  const [takerAmount, setTakerAmount] = useState('')
  const [poolName, setPoolName] = useState('public')
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!window.ethereum) {
      setMessage('MetaMask wallet is required')
      return
    }
    try {
      const metamaskProvider = new ethers.BrowserProvider(window.ethereum)
      await metamaskProvider.send('eth_requestAccounts', [])
      const signer = metamaskProvider.getSigner()
      const address = await signer.getAddress()

      const order = {
        makerToken,
        takerToken,
        makerAmount: ethers.parseUnits(makerAmount, 18).toString(),
        takerAmount: ethers.parseUnits(takerAmount, 18).toString(),
        maker: address,
        taker: ethers.ZeroAddress,
        expiry: Math.floor(Date.now() / 1000) + 3600, // Expires 1 hour from now
        nonce: Math.floor(Math.random() * 1_000_000),
      }

      const signedOrder = await signOrder(order, signer)
      const res = await submitOrder(signedOrder, poolName === 'public' ? null : poolName)
      if (res.success) {
        setMessage('✅ Order successfully submitted to PonyHof')
      } else {
        setMessage(`❌ Submission failed: ${res.error || 'unknown error'}`)
      }
    } catch (err) {
      setMessage(`Error signing or submitting order: ${err.message}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
      <h3>Submit a Limit Order</h3>

      <label>
        Maker Token Address<br/>
        <input
          type="text"
          value={makerToken}
          onChange={(e) => setMakerToken(e.target.value)}
          placeholder="0x..."
          required
          style={{ width: '100%' }}
        />
      </label>

      <label>
        Taker Token Address<br/>
        <input
          type="text"
          value={takerToken}
          onChange={(e) => setTakerToken(e.target.value)}
          placeholder="0x..."
          required
          style={{ width: '100%' }}
        />
      </label>

      <label>
        Maker Amount<br/>
        <input
          type="number"
          step="any"
          value={makerAmount}
          onChange={(e) => setMakerAmount(e.target.value)}
          required
        />
      </label>

      <label>
        Taker Amount<br/>
        <input
          type="number"
          step="any"
          value={takerAmount}
          onChange={(e) => setTakerAmount(e.target.value)}
          required
        />
      </label>

      <label>
        Select Dark Pool<br/>
        <select value={poolName} onChange={(e) => setPoolName(e.target.value)}>
          <option value="public">Public Pool</option>
          <option value="whales">Whales Pool</option>
          <option value="institutions">Institutions Pool</option>
        </select>
      </label>

      <br />
      <button type="submit">Sign & Submit Order</button>
      <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{message}</p>
    </form>
  )
}
