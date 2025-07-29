import dotenv from 'dotenv'
dotenv.config()

import { ethers } from 'ethers'

/**
 * Lazily fetch the RPC URL from environment variable.
 * Throws an error if missing.
 * @returns {string} The RPC URL.
 */
function getRpcUrl() {
  const url = process.env.SEPOLIA_RPC_URL
  if (!url) throw new Error('SEPOLIA_RPC_URL env var missing')
  return url
}

/**
 * Export a getter for ethers provider to ensure fresh env vars are respected.
 */
export const provider = {
  get value() {
    const url = getRpcUrl()
    return new ethers.JsonRpcProvider(url)
  }
}
