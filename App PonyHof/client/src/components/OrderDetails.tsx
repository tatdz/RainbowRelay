import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Lock, Unlock, ExternalLink, Eye, Shield, CheckCircle } from "lucide-react";
import { clientEncryption } from "@/lib/encryption";
import { useToast } from "@/hooks/use-toast";

interface OrderDetailsProps {
  order: any;
  orderHash: string;
  orderStatus: any;
  canDecrypt?: boolean;
}

export default function OrderDetails({ order, orderHash, orderStatus, canDecrypt = false }: OrderDetailsProps) {
  const [decryptedOrder, setDecryptedOrder] = useState<any>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const { toast } = useToast();

  const handleDecrypt = async () => {
    if (!order.encrypted || !canDecrypt) return;
    
    setIsDecrypting(true);
    try {
      const decrypted = await clientEncryption.decryptOrder({
        encrypted: order.data,
        iv: order.iv,
        poolName: order.poolName
      });
      setDecryptedOrder(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
    }
    setIsDecrypting(false);
  };

  const formatAmount = (amount: string) => {
    try {
      return (parseFloat(amount) / 1e18).toFixed(4);
    } catch {
      return amount;
    }
  };

  const isLargeTrade = (makingAmount: string) => {
    try {
      return parseFloat(makingAmount) / 1e18 > 100; // Threshold for large trades
    } catch {
      return false;
    }
  };

  const getSepoliaExplorerLink = (hash: string) => {
    // Use the actual transaction hash if order is filled
    if (order.fillTxHash) {
      return `https://sepolia.etherscan.io/tx/${order.fillTxHash}`;
    }
    // Use blockchain order hash for unfilled orders
    if (order.blockchainOrderHash) {
      return `https://sepolia.etherscan.io/search?q=${order.blockchainOrderHash}`;
    }
    // Fallback to general search
    return `https://sepolia.etherscan.io/search?q=${hash}`;
  };

  const getIPFSLink = (hash: string) => {
    // Use the public CID if available, otherwise use the local hash
    const publicCid = order.publicCid || hash;
    return `https://gateway.pinata.cloud/ipfs/${publicCid}`;
  };



  const displayOrder = decryptedOrder || (order.encrypted ? null : order.order);
  const showEncrypted = order.encrypted && !decryptedOrder;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="w-3 h-3 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {order.encrypted ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span>Order Details</span>
            {displayOrder && isLargeTrade(displayOrder.makingAmount) && (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>Large Trade</span>
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Encryption Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center space-x-2">
                {order.encrypted ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                <span>Privacy Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.encrypted ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pool:</span>
                    <Badge>{order.poolName}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Encryption:</span>
                    <Badge variant="secondary">AES-256</Badge>
                  </div>
                  {canDecrypt && !decryptedOrder && (
                    <Button
                      onClick={handleDecrypt}
                      disabled={isDecrypting}
                      className="w-full"
                      size="sm"
                    >
                      {isDecrypting ? 'Decrypting...' : 'Decrypt Order'}
                    </Button>
                  )}
                  {canDecrypt && decryptedOrder && (
                    <div className="text-xs text-green-600 text-center">
                      ✓ Order decrypted successfully
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Public order - signed with MetaMask
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Information */}
          {displayOrder && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Maker Asset</span>
                    <p className="font-mono text-xs break-all">{displayOrder.makerAsset}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Taker Asset</span>
                    <p className="font-mono text-xs break-all">{displayOrder.takerAsset}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Making Amount</span>
                    <p className="font-medium">{formatAmount(displayOrder.makingAmount)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Taking Amount</span>
                    <p className="font-medium">{formatAmount(displayOrder.takingAmount)}</p>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Maker</span>
                  <p className="font-mono text-xs break-all">{displayOrder.maker}</p>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground">Salt</span>
                  <p className="font-mono text-xs">{displayOrder.salt}</p>
                </div>

                {displayOrder.predicate && displayOrder.predicate !== '0x' && (
                  <div>
                    <span className="text-xs text-muted-foreground flex items-center space-x-1">
                      <Shield className="w-3 h-3" />
                      <span>Predicate Order</span>
                    </span>
                    <Badge variant="outline" className="mt-1">
                      Advanced Execution Logic
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showEncrypted && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Lock className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Order details are encrypted</p>
                  <p className="text-xs">Only pool members can view this order</p>
                </div>
              </CardContent>
            </Card>
          )}



          {/* Blockchain Links */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Verification Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sepolia Explorer:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(getSepoliaExplorerLink(orderHash), '_blank')}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  {order.fillTxHash ? 'View Fill TX' : 'Search Sepolia'}
                </Button>
              </div>
              
              {order.fillTxHash && (
                <div className="p-3 bg-green-950 border border-green-800 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-300">Order Filled On-Chain</span>
                  </div>
                  <div className="mt-2 text-xs text-green-400">
                    TX: {order.fillTxHash.slice(0, 20)}...
                  </div>
                  <div className="mt-1 text-xs text-green-500">
                    Verified on Sepolia blockchain
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">IPFS Content:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(getIPFSLink(orderHash), '_blank')}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  View on IPFS
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Order Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Order Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fill Status:</span>
                  <Badge variant={order.status === 'filled' ? 'default' : 'secondary'}>
                    {order.status === 'filled' ? 'Filled' : order.status === 'cancelled' ? 'Cancelled' : 'Pending'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Transaction:</span>
                  {order.fillTxHash ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-green-400 hover:text-green-300 p-1 h-auto"
                      onClick={() => window.open(`https://sepolia.etherscan.io/tx/${order.fillTxHash}`, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View TX
                    </Button>
                  ) : (
                    <Badge variant="secondary">No Transaction</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Large Trade Notice */}
          {displayOrder && isLargeTrade(displayOrder.makingAmount) && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start space-x-2">
                  <Shield className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Enhanced Privacy Protection</p>
                    <p className="text-xs text-green-600 mt-1">
                      This large order benefits from encrypted relay and permission-based access, 
                      protecting against front-runner leaks and MEV attacks.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}