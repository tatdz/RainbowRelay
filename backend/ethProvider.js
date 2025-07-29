import dotenv from 'dotenv'
dotenv.config()

import { ethers } from 'ethers'

const RPC_URL = process.env.SEPOLIA_RPC_URL
if (!RPC_URL) throw new Error('SEPOLIA_RPC_URL env var missing')

export const provider = new ethers.JsonRpcProvider(RPC_URL)
