import { addPeerToPool, removePeerFromPool, isPeerInPool,
         encryptOrderForPool, decryptOrderFromPool, darkPools, poolKeys } from '../backend/darkpool.js'

describe('darkpool.js dark pool management and encryption', () => {
  const poolName = 'whales'
  const peerId = 'peerX'
  const sampleOrder = { id: 123, data: 'order data' }

  test('addPeerToPool and isPeerInPool work correctly', () => {
    addPeerToPool(poolName, peerId)
    expect(isPeerInPool(poolName, peerId)).toBe(true)
  })

  test('removePeerFromPool removes peer', () => {
    removePeerFromPool(poolName, peerId)
    expect(isPeerInPool(poolName, peerId)).toBe(false)
  })

  test('encryptOrderForPool and decryptOrderFromPool', () => {
    // Make sure pool key exists
    expect(poolKeys[poolName]).toBeDefined()

    const encrypted = encryptOrderForPool(sampleOrder, poolName)
    expect(typeof encrypted).toBe('string')

    const decrypted = decryptOrderFromPool(encrypted, poolName)
    expect(decrypted).toEqual(sampleOrder)
  })

  test('throws error if encryption key missing', () => {
    expect(() => encryptOrderForPool(sampleOrder, 'nonexistentPool')).toThrow()
  })
})
