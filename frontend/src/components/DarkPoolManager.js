import React, { useState } from 'react'
import { joinPool } from '../api'

export default function DarkPoolManager({ peerId }) {
  const [poolName, setPoolName] = useState('')

  async function handleJoin() {
    if (!poolName) return alert('Enter pool name')
    try {
      const res = await joinPool(poolName, peerId)
      alert(res.success ? `Joined ${poolName}` : 'Failed to join pool')
    } catch (e) {
      alert('Error joining pool: ' + e.message)
    }
  }

  return (
    <div>
      <h3>Join a Dark Pool</h3>
      <input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="Pool Name"/>
      <button onClick={handleJoin}>Join Pool</button>
    </div>
  )
}
