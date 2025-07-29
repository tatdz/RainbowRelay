import dotenv from 'dotenv'
dotenv.config()
import crypto from 'crypto'
import { encryptOrder, decryptOrder, generateOrderID, ENCRYPTION_KEY } from '../backend/utils.js'

describe('utils.js encryption and ID generation', () => {
  const sampleOrder = { maker: '0xabc', taker: '0xdef', amount: 1000 }
  const key = crypto.createHash('sha256').update('testkey').digest()

  test('encryptOrder and decryptOrder consistency', () => {
    const encrypted = encryptOrder(sampleOrder, key)
    expect(typeof encrypted).toBe('string')

    const decrypted = decryptOrder(encrypted, key)
    expect(decrypted).toEqual(sampleOrder)
  })

  test('generateOrderID returns a string with prefix', () => {
    const prefix = 'test-'
    const id = generateOrderID(prefix)
    expect(id.startsWith(prefix)).toBe(true)
    expect(id.length).toBeGreaterThan(prefix.length)
  })

  test('ENCRYPTION_KEY is a Buffer when env set', () => {
    expect(Buffer.isBuffer(ENCRYPTION_KEY)).toBe(true)
  })
})
