# PonyHof - Decentralized Encrypted Order Relay Network

## Overview

PonyHof is a **decentralized, encrypted, permissioned order relay overlay** that enhances the 1inch Limit Order Protocol. It creates encrypted dark pools where traders can share and match limit orders off-chain securely. 

deployed @ https://ponyhof.replit.app/

## How PonyHof Complements 1inch Fusion Implementation
### Extends privacy and control:
PonyHof introduces permissioned dark pools with cryptographic encryption, allowing selective sharing of sensitive limit orders, which 1inch Fusion doesn’t natively offer. This boosts institutional traders’ confidence in maintaining confidentiality.

### Decentralizes order relay:
By building on libp2p and IPFS, PonyHof replaces a centralized resolver service with a decentralized encrypted relay mesh. This enhances censorship resistance, fault tolerance, and trustlessness in order propagation.

### Adds reputation and trust scoring:
PonyHof’s reputational system for relayers and traders incentivizes trustworthy and censorship-resistant behavior, addressing governance transparency that is not explicitly covered in 1inch Fusion.

### Compatible on-chain settlement:
PonyHof leverages the existing 1inch Limit Order contracts, enabling easy integration and gasless fills while focusing on improving the off-chain order sharing layer.

### Enables programmable, pool-specific logic:
The flexible P2P relay design allows custom order logic and pool membership semantics, supporting more complex trading strategies and business rules beyond Fusion’s scope.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for the client-side application
- **Vite** as the build tool and development server
- **Tailwind CSS** with **shadcn/ui** components for styling
- **React Router (wouter)** for client-side routing
- **TanStack Query** for server state management
- **React Hook Form** with Zod validation for form handling

### Backend Architecture
- **Express.js** server with TypeScript
- **Node.js** runtime with ESM modules
- RESTful API design with structured route handlers
- **Middleware-based** request/response processing
- Error handling with proper HTTP status codes

### Database Strategy
- **Drizzle ORM** configured for PostgreSQL
- **Neon Database** as the serverless PostgreSQL provider
- **Schema-first** approach with TypeScript types generated from database schema
- Migration support through drizzle-kit

### Blockchain Integration
- **Ethereum Sepolia testnet** integration
- **1inch Limit Order Protocol** contract interaction
- **MetaMask** wallet connection and EIP712 signature support
- **Ethers.js** for blockchain interactions

## Key Components

### 1. Decentralized Network Services
- **LibP2P Service**: Peer-to-peer networking with gossipsub for encrypted order propagation
- **IPFS Service**: Content storage and retrieval using Helia with persistent blockstore
- **Blockchain Service**: Ethereum contract monitoring and transaction handling

### 2. Security & Encryption
- **Pool-based encryption**: Separate encryption keys for "whales" and "institutions" pools
- **EIP712 signatures**: Off-chain order signing with MetaMask
- **Encrypted order storage**: Orders stored encrypted in IPFS and database

### 3. Reputation System
- **User reputation**: Based on order success rate, volume, and cancellation penalties
- **Relay node reputation**: Based on uptime, response time, and orders processed
- **Censorship resistance**: Decentralized scoring prevents manipulation

### 4. Order Management
- **Dark pool categorization**: Orders segregated into permission-based pools
- **Order lifecycle tracking**: Pending → Matched → Filled → Cancelled states
- **Real-time updates**: Live order status and network activity feeds

## Data Flow

1. **Order Creation**:
   - User connects MetaMask wallet
   - Creates order with pool selection (whales/institutions)
   - Signs EIP712 order data off-chain
   - Order encrypted with pool-specific key
   - Stored in database and propagated via IPFS/LibP2P

2. **Order Matching**:
   - Relay nodes monitor for compatible orders
   - Encrypted order data shared within permission groups
   - Matching logic runs on decentralized nodes
   - Settlement prepared for on-chain execution

3. **Order Settlement**:
   - Matched orders executed on Ethereum Sepolia
   - Blockchain events monitored for confirmation
   - Order status updated across network
   - Reputation scores adjusted based on outcomes

## External Dependencies

### Blockchain Infrastructure
- **Sepolia RPC Provider**: Alchemy or Infura for Ethereum connectivity
- **1inch Protocol Contracts**: LimitOrderProtocol and GasStationOnFill
- **MetaMask**: Browser wallet for user authentication and signing

### P2P Network
- **LibP2P**: Decentralized networking stack
- **IPFS/Helia**: Content-addressed storage
- **Gossipsub**: Publish-subscribe messaging protocol

### Development Tools
- **Radix UI**: Headless component primitives
- **Lucide Icons**: Icon library
- **Class Variance Authority**: Component styling utilities
