import crypto from 'crypto'
import { encryptOrder, decryptOrder } from './utils.js'

const darkPools = {}  // poolName -> Set<peerId>
const poolKeys = {}   // poolName -> symmetric key Buffer

export function addPeerToPool(poolName, peerId) {
  if (!darkPools[poolName]) darkPools[poolName] = new Set()
  darkPools[poolName].add(peerId)
}

export function removePeerFromPool(poolName, peerId) {
  darkPools[poolName]?.delete(peerId)
}

export function isPeerInPool(poolName, peerId) {
  return darkPools[poolName]?.has(peerId)
}

export function encryptOrderForPool(order, poolName) {
  const key = poolKeys[poolName]
  if (!key) throw new Error(`Encryption key missing for pool ${poolName}`)
  return encryptOrder(order, key)
}

export function decryptOrderFromPool(encryptedOrder, poolName) {
  const key = poolKeys[poolName]
  if (!key) throw new Error(`Encryption key missing for pool ${poolName}`)
  return decryptOrder(encryptedOrder, key)
}

// Initialize keys from env (demo or production replace with key exchange)
poolKeys['whales'] = process.env.POOL_WHALES_KEY
  ? Buffer.from(process.env.POOL_WHALES_KEY, 'hex')
  : crypto.randomBytes(32)
poolKeys['institutions'] = process.env.POOL_INSTITUTIONS_KEY
  ? Buffer.from(process.env.POOL_INSTITUTIONS_KEY, 'hex')
  : crypto.randomBytes(32)

export { darkPools, poolKeys }
