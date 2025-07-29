const DEFAULT_REPUTATION = 100
const MAX_REPUTATION = 200
const MIN_REPUTATION = 0

export const peerReputation = new Map()

export function getPeerReputation(peerId) {
  if (!peerReputation.has(peerId)) {
    peerReputation.set(peerId, { score: DEFAULT_REPUTATION, lastUpdated: Date.now() })
  }
  return peerReputation.get(peerId)
}

export function updatePeerReputation(peerId, delta) {
  const rec = getPeerReputation(peerId)
  rec.score = Math.min(MAX_REPUTATION, Math.max(MIN_REPUTATION, rec.score + delta))
  rec.lastUpdated = Date.now()
  peerReputation.set(peerId, rec)
}
