import { jest } from '@jest/globals'
import { provider, rpcUrl, setProviderFactory } from './ethProvider.js'

describe('ethProvider.js', () => {
  const originalEnv = { ...process.env }
  let mockProvider

  beforeAll(() => {
    process.env.SEPOLIA_RPC_URL = 'https://sepolia.example.com'
    
    // Create mock provider
    mockProvider = {
      url: process.env.SEPOLIA_RPC_URL,
      _isProvider: true,
      getBlockNumber: jest.fn().mockResolvedValue(123456),
      detectNetwork: jest.fn().mockResolvedValue({ chainId: 11155111 })
    }
    
    // Override provider factory
    setProviderFactory(() => mockProvider)
  })

  afterAll(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  describe('provider', () => {
    it('should create a provider instance with correct URL', () => {
      const currentProvider = provider.value
      expect(currentProvider.url).toBe(process.env.SEPOLIA_RPC_URL)
      expect(currentProvider._isProvider).toBe(true)
    })

    it('should be able to fetch block number', async () => {
      const currentProvider = provider.value
      const blockNumber = await currentProvider.getBlockNumber()
      expect(blockNumber).toBe(123456)
      expect(currentProvider.getBlockNumber).toHaveBeenCalled()
    })
  })

  describe('rpcUrl', () => {
    it('should return the RPC URL from env', () => {
      expect(rpcUrl.value).toBe(process.env.SEPOLIA_RPC_URL)
    })

    it('should throw if SEPOLIA_RPC_URL is missing', () => {
      delete process.env.SEPOLIA_RPC_URL
      expect(() => rpcUrl.value).toThrow('SEPOLIA_RPC_URL env var missing')
    })
  })
})