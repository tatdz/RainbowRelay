import { ethers } from 'ethers'

const RPC_URL = process.env.REACT_APP_SEPOLIA_RPC_URL // from .env
export const provider = new ethers.JsonRpcProvider(RPC_URL)

export const domain = {
  name: '1inch Limit Order Protocol',
  version: '4',
  chainId: 11155111,
  verifyingContract: process.env.REACT_APP_LIMIT_ORDER_CONTRACT
}

export const types = {
  LimitOrder: [
    { name: 'makerToken', type: 'address' },
    { name: 'takerToken', type: 'address' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
}

export async function signOrder(order, signer) {
  const signature = await signer._signTypedData(domain, types, order)
  return { ...order, signature }
}
