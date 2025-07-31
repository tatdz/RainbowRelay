import React, { useEffect, useState } from 'react'
import { fetchPeerReputations } from '../api'

export default function ReputationList() {
  const [reputations, setReputations] = useState([])

  useEffect(() => {
    fetchPeerReputations().then(setReputations)
  }, [])

  return (
    <div>
      <h3>Relay Node Reputations</h3>
      <ul>
        {reputations.length === 0 && <li>No reputations found</li>}
        {reputations.map(({ peerId, score }) => (
          <li key={peerId}>
            {peerId.slice(0, 8)}... : {score}
          </li>
        ))}
      </ul>
    </div>
  )
}
