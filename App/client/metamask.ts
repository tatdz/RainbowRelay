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

export async function connectMetaMask(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
  }

  try {
    // Check if already connected first
    const existingAccounts = await window.ethereum.request({
      method: "eth_accounts",
    });
    
    if (existingAccounts.length > 0) {
      return existingAccounts[0];
    }

    // Request connection if not already connected
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (accounts.length === 0) {
      throw new Error("No accounts found. Please make sure MetaMask is unlocked.");
    }

    return accounts[0];
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error("User rejected the connection request.");
    } else if (error.code === -32002) {
      throw new Error("Connection request already pending. Please check MetaMask.");
    } else if (error.code === 4100) {
      throw new Error("MetaMask is locked. Please unlock it first.");
    }
    
    console.error("MetaMask connection error:", error);
    throw new Error(`Failed to connect to MetaMask: ${error.message || 'Unknown error'}`);
  }
}

export async function getAccount(): Promise<string | null> {
  if (!window.ethereum) {
    return null;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_accounts",
    });
    return accounts.length > 0 ? accounts[0] : null;
  } catch (error) {
    console.error("Failed to get account:", error);
    return null;
  }
}

export async function switchToSepolia(): Promise<void> {
  if (!window.ethereum) {
    throw new Error("MetaMask is not available");
  }

  const sepoliaChainId = "0xaa36a7"; // Sepolia testnet chain ID

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: sepoliaChainId }],
    });
  } catch (error: any) {
    // If the chain hasn't been added to MetaMask, add it
    if (error.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: sepoliaChainId,
              chainName: "Sepolia Test Network",
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://sepolia.infura.io/v3/"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } catch (addError) {
        throw new Error("Failed to add Sepolia network to MetaMask");
      }
    } else {
      throw new Error(`Failed to switch to Sepolia network: ${error.message}`);
    }
  }
}

export async function getCurrentChainId(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("MetaMask is not available");
  }

  return await window.ethereum.request({ method: "eth_chainId" });
}
