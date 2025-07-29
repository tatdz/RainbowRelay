import crypto from 'crypto'

/**
 * Helper to lazily get ENCRYPTION_KEY as a 32-byte buffer derived by SHA-256 hash
 * from the environment variable ENCRYPTION_KEY.
 * Returns null if env var is missing or empty.
 */
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) return null
  try {
    return crypto.createHash('sha256').update(secret).digest()
  } catch {
    return null
  }
}

/**
 * Encrypt a limit order object using AES-256-CTR with the given key.
 * @param {Object} order - The order object to encrypt.
 * @param {Buffer} key - 32-byte symmetric key.
 * @returns {string} Hex string of encrypted data.
 */
export function encryptOrder(order, key) {
  if (!key || key.length !== 32) {
    throw new Error('Invalid encryption key: must be 32 bytes')
  }
  const plaintext = JSON.stringify(order)
  const cipher = crypto.createCipheriv('aes-256-ctr', key, Buffer.alloc(16, 0)) // zero IV for CTR
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return encrypted.toString('hex')
}

/**
 * Decrypt an encrypted hex string back into an order object.
 * @param {string} encryptedHex - Hex string encrypted order.
 * @param {Buffer} key - 32-byte symmetric key.
 * @returns {Object} The decrypted order object.
 */
export function decryptOrder(encryptedHex, key) {
  if (!key || key.length !== 32) {
    throw new Error('Invalid decryption key: must be 32 bytes')
  }
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, Buffer.alloc(16, 0))
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  try {
    return JSON.parse(decrypted.toString())
  } catch (err) {
    throw new Error('Failed to parse decrypted order JSON: ' + err.message)
  }
}

/**
 * Generate a unique order ID consisting of an optional prefix,
 * the current timestamp in ms, and 6 random hex characters.
 * @param {string} prefix - Optional prefix string.
 * @returns {string} generated unique order ID.
 */
export function generateOrderID(prefix = '') {
  return `${prefix}${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

/**
 * Export a getter for ENCRYPTION_KEY that updates dynamically on each access,
 * avoiding issues with environment variables not loaded before import.
 */
export const ENCRYPTION_KEY = {
  get value() {
    return getEncryptionKey()
  }
}