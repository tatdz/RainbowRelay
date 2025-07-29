import { getPeerReputation, updatePeerReputation, peerReputation } from '../backend/reputation.js'

describe('reputation.js peer reputation system', () => {
  const peerId = 'peer123'

  test('getPeerReputation initializes new peer with default score', () => {
    peerReputation.clear()
    const rep = getPeerReputation(peerId)
    expect(rep.score).toBe(100)
    expect(rep.lastUpdated).toBeLessThanOrEqual(Date.now())
  })

  test('updatePeerReputation clamps score within bounds', () => {
    peerReputation.clear()
    updatePeerReputation(peerId, 150)
    let rep = getPeerReputation(peerId)
    expect(rep.score).toBe(200) // capped at MAX

    updatePeerReputation(peerId, -300)
    rep = getPeerReputation(peerId)
    expect(rep.score).toBe(0) // capped at MIN
  })
})
