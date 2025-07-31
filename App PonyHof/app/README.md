# PonyHof App - Complete Local Setup

This folder contains the complete PonyHof application for easy local hosting and usage by contributors.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Application**
   ```bash
   npm run dev
   ```

This will start both the frontend and backend concurrently with proper environment configuration.

## Architecture

- **Frontend**: React 18 with TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js with Express, LibP2P, IPFS/Helia
- **Blockchain**: Ethereum Sepolia testnet integration
- **Encryption**: AES-256 for dark pool orders
- **Signing**: EIP712 MetaMask integration

## Features

✓ **MetaMask Integration**: Proper EIP712 signing for 1inch Limit Order Protocol  
✓ **Sepolia Testnet**: Real blockchain connection with event listening  
✓ **AES-256 Encryption**: Client-side encryption for dark pool orders  
✓ **Pool Access Control**: Whales and institutions pools with separate keys  
✓ **Signature Validation**: Backend validates EIP712 signatures  
✓ **Order Hash Tracking**: Real order hashes for blockchain monitoring  

## User Flow

1. Connect MetaMask wallet on Sepolia testnet
2. Create limit orders with full 1inch protocol support
3. Choose public (signed) or private (encrypted) orders
4. Submit to decentralized relay network
5. Monitor real-time order status and reputation
6. View live encrypted message feeds for authorized pools

## Development

The app follows a monorepo structure with shared TypeScript types between frontend and backend, ensuring type safety across the entire stack.