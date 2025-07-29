import React, { useEffect, useState } from 'react'
import { fetchPeerReputations } from '../api'

export default function ReputationList() {
  const [reps, setReps] = useState([])

  useEffect(() => {
    fetchPeerReputations().then(setReps)
  }, [])

  return (
    <div>
      <h3>Relay Node Reputations</h3>
      <ul>
        {reps.map(({ peerId, score }) => (
          <li key={peerId}>{peerId.slice(0, 8)}... : {score}</li>
        ))}
      </ul>
    </div>
  )
}
