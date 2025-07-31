import { useState, useCallback, useEffect } from "react";
import { connectMetaMask, getAccount, switchToSepolia } from "@/lib/metamask";

export function useWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const account = await getAccount();
      if (account) {
        setIsConnected(true);
        setAddress(account);
      }
    } catch (error) {
      console.log("Wallet not connected");
    }
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    try {
      const account = await connectMetaMask();
      await switchToSepolia();
      setIsConnected(true);
      setAddress(account);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress(null);
  }, []);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Listen for account changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAddress(accounts[0]);
          setIsConnected(true);
        }
      };

      const handleChainChanged = () => {
        // Reload the page when network changes
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [disconnect]);

  return {
    isConnected,
    address,
    isConnecting,
    connect,
    disconnect,
  };
}
