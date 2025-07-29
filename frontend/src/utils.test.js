import { signOrder, domain, types, provider } from '../../frontend/src/utils'

describe('frontend utils.js', () => {
  test('domain and types structure', () => {
    expect(domain.name).toBe('1inch Limit Order Protocol')
    expect(types.LimitOrder.length).toBeGreaterThan(0)
  })

  test('signOrder returns signed order data', async () => {
    // Mock signer for _signTypedData method
    const signer = {
      _signTypedData: jest.fn().mockResolvedValue('0xsig')
    }
    const order = {
      makerToken: '0x0',
      takerToken: '0x0',
      makerAmount: '1000',
      takerAmount: '500',
      maker: '0xabc',
      taker: '0xdef',
      expiry: 1234567890,
      nonce: 1
    }
    const signed = await signOrder(order, signer)
    expect(signed).toHaveProperty('signature')
    expect(signed.signature).toBe('0xsig')
  })
})
