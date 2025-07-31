# PonyHof - Decentralized Encrypted Order Relay Network

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access the Application**
   - Frontend: http://localhost:5000
   - Backend API: http://localhost:5000/api

## Features

- **Decentralized Order Relay**: Encrypted order sharing across peer networks
- **MetaMask Integration**: EIP712 signature support for 1inch Limit Order Protocol
- **GasStationOnFill**: Gasless order execution with front-run protection
- **Real Sepolia Integration**: Authentic blockchain transactions with verification
- **Dark Pool Access**: Permission-based encrypted order pools (whales/institutions)
- **Reputation System**: Trust scoring based on order success and network participation

## Architecture

- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js with RESTful APIs
- **Database**: PostgreSQL with Drizzle ORM
- **Blockchain**: Ethereum Sepolia testnet integration
- **P2P Network**: LibP2P with IPFS for decentralized storage
- **Encryption**: AES-256 client-side encryption for dark pool orders

## Key Components

### GasStationOnFill Integration
- Contract: `0x14d4dfc203f1a1a748cbecdc2ac70a60d7f9d010`
- Features: Zero gas fees, MEV protection, smooth execution
- Verification: Real Sepolia blockchain confirmations

### Order Management
- Public orders: MetaMask signed, visible to all
- Private orders: Client-side encrypted, pool-restricted access
- Real-time status updates with blockchain confirmation

### Security Features
- EIP712 typed data signing
- Pool-based encryption keys
- Decentralized reputation scoring
- Front-run protection through encryption

## Development

Built on Replit with hot reloading and automatic deployments. All changes are tracked in this "App PonyHof" folder for easy GitHub integration and contributor access.

## Deployment

Ready for production deployment with Replit Deployments - includes automatic builds, hosting, TLS, and health checks.