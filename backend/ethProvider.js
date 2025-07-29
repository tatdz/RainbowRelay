import { ethers } from 'ethers'

// Default provider factory (can be overridden in tests)
let providerFactory = (url) => new ethers.JsonRpcProvider(url)

export function setProviderFactory(fn) {
  providerFactory = fn
}

export function getRpcUrl() {
  const url = process.env.SEPOLIA_RPC_URL
  if (!url) throw new Error('SEPOLIA_RPC_URL env var missing')
  return url
}

export const provider = {
  get value() {
    return providerFactory(getRpcUrl())
  }
}

export const rpcUrl = {
  get value() {
    return getRpcUrl()
  }
}