import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Activity, CheckCircle, AlertCircle } from "lucide-react";

interface SepoliaTrackerProps {
  orderHash: string;
  txHash?: string;
  blockNumber?: number;
}

interface TransactionStatus {
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  gasUsed?: string;
  gasPrice?: string;
}

export default function SepoliaTracker({ orderHash, txHash, blockNumber }: SepoliaTrackerProps) {
  const [txStatus, setTxStatus] = useState<TransactionStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (txHash) {
      checkTransactionStatus();
      const interval = setInterval(checkTransactionStatus, 10000); // Check every 10s
      return () => clearInterval(interval);
    }
  }, [txHash]);

  const checkTransactionStatus = async () => {
    if (!txHash) return;
    
    setLoading(true);
    try {
      // Check transaction status via backend blockchain service
      const response = await fetch(`/api/blockchain/tx-status/${txHash}`);
      if (response.ok) {
        const status = await response.json();
        setTxStatus(status);
      }
    } catch (error) {
      console.error('Failed to check transaction status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Real Sepolia explorer links using environment contract addresses
  const sepoliaExplorer = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : null;
  const contractAddress = import.meta.env.VITE_LIMIT_ORDER_CONTRACT || '0x11431a89893025D2a48dCA4EddC396f8C8117187';
  const orderExplorer = `https://sepolia.etherscan.io/address/${contractAddress}`;

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-sm text-blue-700 dark:text-blue-300">
          <Activity className="w-4 h-4" />
          <span>Sepolia Blockchain Tracking</span>
          {txStatus?.status === 'confirmed' && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          {txStatus?.status === 'failed' && (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Order Hash:</span>
            <code className="text-xs font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
              {orderHash.slice(0, 10)}...{orderHash.slice(-8)}
            </code>
          </div>
          
          {txHash && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Transaction:</span>
              <div className="flex items-center space-x-2">
                <code className="text-xs font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </code>
                {txStatus && (
                  <Badge 
                    variant={
                      txStatus.status === 'confirmed' ? 'default' :
                      txStatus.status === 'failed' ? 'destructive' : 'secondary'
                    }
                    className="text-xs"
                  >
                    {txStatus.status}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {txStatus && txStatus.status === 'confirmed' && (
            <div className="text-xs text-green-600 dark:text-green-400 space-y-1">
              <p>✓ Transaction confirmed on Sepolia</p>
              <p>Confirmations: {txStatus.confirmations}</p>
              {txStatus.gasUsed && (
                <p>Gas used: {parseInt(txStatus.gasUsed).toLocaleString()}</p>
              )}
            </div>
          )}

          {blockNumber && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Block:</span>
              <span className="text-xs font-medium">#{blockNumber.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="flex space-x-2">
          {sepoliaExplorer && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.open(sepoliaExplorer, '_blank')}
              className="h-7 text-xs flex-1 border-blue-200 hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              View Transaction
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open(orderExplorer, '_blank')}
            className="h-7 text-xs flex-1 border-blue-200 hover:bg-blue-100 dark:border-blue-800 dark:hover:bg-blue-900"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Contract
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Real-time tracking on Sepolia testnet
        </div>
      </CardContent>
    </Card>
  );
}