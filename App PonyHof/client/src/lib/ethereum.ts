import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on?: (event: string, callback: (...args: any[]) => void) => void;
      removeListener?: (event: string, callback: (...args: any[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export interface LimitOrder {
  salt: string;
  makerAsset: string;
  takerAsset: string;
  maker: string;
  receiver: string;
  allowedSender: string;
  makingAmount: string;
  takingAmount: string;
  makerAssetData: string;
  takerAssetData: string;
  getMakingAmount: string;
  getTakingAmount: string;
  predicate: string;
  permit: string;
  interaction: string;
}

// EIP712 Domain for 1inch Limit Order Protocol on Sepolia
export const EIP712_DOMAIN = {
  name: "1inch Limit Order Protocol",
  version: "2",
  chainId: 11155111, // Sepolia testnet
  verifyingContract: "" // Will be set from environment
};

// EIP712 Types for Limit Orders
export const EIP712_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'makerAssetData', type: 'bytes' },
    { name: 'takerAssetData', type: 'bytes' },
    { name: 'getMakingAmount', type: 'bytes' },
    { name: 'getTakingAmount', type: 'bytes' },
    { name: 'predicate', type: 'bytes' },
    { name: 'permit', type: 'bytes' },
    { name: 'interaction', type: 'bytes' }
  ]
};

export class EthereumService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;

  async connectWallet(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('MetaMask not found. Please install MetaMask to continue.');
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please connect your wallet.');
      }

      // Check if we're on Sepolia testnet
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0x2a9f') { // Sepolia chainId in hex
        // Try to switch to Sepolia
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2a9f' }]
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // Network not added, add Sepolia
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2a9f',
                chainName: 'Sepolia Test Network',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://sepolia.infura.io/v3/'],
                blockExplorerUrls: ['https://sepolia.etherscan.io/']
              }]
            });
          } else {
            throw switchError;
          }
        }
      }

      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();

      return accounts[0];
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }

  async signLimitOrder(order: LimitOrder): Promise<string> {
    if (!this.signer) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    try {
      // Set the domain verifying contract
      const domain = {
        ...EIP712_DOMAIN,
        verifyingContract: import.meta.env.VITE_LIMIT_ORDER_CONTRACT || "0x" // Fallback
      };

      // Sign the order using EIP712
      const signature = await this.signer.signTypedData(domain, EIP712_TYPES, order);
      
      console.log('Order signed successfully');
      return signature;
    } catch (error) {
      console.error('Order signing failed:', error);
      throw error;
    }
  }

  async getCurrentAccount(): Promise<string | null> {
    if (!window.ethereum) return null;

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts'
      });
      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error('Failed to get current account:', error);
      return null;
    }
  }

  createLimitOrder(params: {
    makerAsset: string;
    takerAsset: string;
    maker: string;
    makingAmount: string;
    takingAmount: string;
  }): LimitOrder {
    return {
      salt: Math.floor(Math.random() * 1000000).toString(),
      makerAsset: params.makerAsset,
      takerAsset: params.takerAsset,
      maker: params.maker,
      receiver: "0x0000000000000000000000000000000000000000",
      allowedSender: "0x0000000000000000000000000000000000000000",
      makingAmount: params.makingAmount,
      takingAmount: params.takingAmount,
      makerAssetData: "0x",
      takerAssetData: "0x",
      getMakingAmount: "0x",
      getTakingAmount: "0x",
      predicate: "0x",
      permit: "0x",
      interaction: "0x"
    };
  }
}

export const ethereumService = new EthereumService();