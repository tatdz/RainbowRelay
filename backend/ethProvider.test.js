
import dotenv from 'dotenv'
dotenv.config()

import { provider } from '../backend/ethProvider.js'

describe('ethProvider.js tests', () => {
  test('provider is ethers provider connected to Sepolia', () => {
    expect(provider).toBeDefined()
    expect(typeof provider.getBlockNumber).toBe('function')
  })

  test('can fetch block number (async)', async () => {
    const blockNumber = await provider.getBlockNumber()
    expect(typeof blockNumber).toBe('number')
  })
})
