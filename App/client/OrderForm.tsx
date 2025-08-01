import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ethereumService, type LimitOrder } from "@/lib/ethereum";
import { clientEncryption } from "@/lib/encryption";

interface OrderFormProps {
  peerId: string;
  onOrderSubmitted?: () => void;
}

export default function OrderForm({ peerId, onOrderSubmitted }: OrderFormProps) {
  const [makerAsset, setMakerAsset] = useState('0xA0b86a33E6D0cf8f1234567890123456789012345');
  const [takerAsset, setTakerAsset] = useState('0xB0b86a33E6D0cf8f1234567890123456789012345');
  const [makerAmount, setMakerAmount] = useState('1.0');
  const [takerAmount, setTakerAmount] = useState('2.0');
  const [privateOrder, setPrivateOrder] = useState(false);
  const [selectedPool, setSelectedPool] = useState('whales');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!makerAsset || !takerAsset || !makerAmount || !takerAmount) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive"
      });
      return;
    }

    if (!peerId) {
      toast({
        title: "Error", 
        description: "Please connect your wallet first",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const limitOrder = {
        makerAsset,
        takerAsset,
        maker: peerId,
        receiver: '0x0000000000000000000000000000000000000000',
        allowedSender: '0x0000000000000000000000000000000000000000',
        makingAmount: (parseFloat(makerAmount) * 1e18).toString(),
        takingAmount: (parseFloat(takerAmount) * 1e18).toString(),
        salt: Math.floor(Math.random() * 1e18).toString(),
        predicate: '0x',
        permit: '0x',
        interaction: '0x',
      };

      // Mock signature for demo
      const mockSignature = `0x${'0'.repeat(130)}`;

      let orderData: any;

      if (privateOrder) {
        // Encrypt the order for dark pool
        try {
          const encryptedOrder = await clientEncryption.encryptOrder(limitOrder, selectedPool);
          
          orderData = {
            encrypted: true,
            data: encryptedOrder.encrypted,
            iv: encryptedOrder.iv,
            poolName: selectedPool,
            submittedAt: Date.now()
          };
          
          toast({
            title: "Order Encrypted",
            description: `Order encrypted for ${selectedPool} pool`,
          });
        } catch (encryptError) {
          throw new Error(`Encryption failed: ${encryptError instanceof Error ? encryptError.message : 'Unknown encryption error'}`);
        }
      } else {
        // Try to sign with MetaMask, fallback to demo signature
        try {
          let signature = mockSignature;
          
          if (window.ethereum && peerId.startsWith('0x')) {
            try {
              signature = await ethereumService.signLimitOrder(limitOrder as LimitOrder);
              toast({
                title: "Order Signed", 
                description: "Order signed with MetaMask",
              });
            } catch (signError) {
              console.warn("MetaMask signing failed, using demo signature:", signError);
              toast({
                title: "Demo Mode", 
                description: "Using demo signature (MetaMask not available)",
              });
            }
          } else {
            toast({
              title: "Demo Mode", 
              description: "Using demo signature (wallet not connected)",
            });
          }
          
          orderData = {
            order: limitOrder,
            signature,
            metadata: { submittedAt: Date.now() },
            encrypted: false
          };
        } catch (signError) {
          throw new Error(`Order creation failed: ${signError instanceof Error ? signError.message : 'Unknown error'}`);
        }
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Success",
          description: privateOrder 
            ? `Encrypted order submitted to ${selectedPool} pool!`
            : "Signed order submitted successfully!",
        });
        
        // Reset form  
        setMakerAsset('0xA0b86a33E6D0cf8f1234567890123456789012345');
        setTakerAsset('0xB0b86a33E6D0cf8f1234567890123456789012345');
        setMakerAmount('1.0');
        setTakerAmount('2.0');
        setPrivateOrder(false);
        setSelectedPool('whales');
        
        onOrderSubmitted?.();
      } else {
        throw new Error(result.error || 'Order submission failed');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to submit order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="makerAsset">Maker Asset Address</Label>
          <Input
            id="makerAsset"
            placeholder="0x..."
            value={makerAsset}
            onChange={(e) => setMakerAsset(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="takerAsset">Taker Asset Address</Label>
          <Input
            id="takerAsset"
            placeholder="0x..."
            value={takerAsset}
            onChange={(e) => setTakerAsset(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="makerAmount">Maker Amount</Label>
          <Input
            id="makerAmount"
            type="number"
            step="0.001"
            placeholder="1.0"
            value={makerAmount}
            onChange={(e) => setMakerAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="takerAmount">Taker Amount</Label>
          <Input
            id="takerAmount"
            type="number"
            step="0.001"
            placeholder="1.0"
            value={takerAmount}
            onChange={(e) => setTakerAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="privateOrder"
          checked={privateOrder}
          onCheckedChange={(checked) => setPrivateOrder(checked === true)}
        />
        <Label htmlFor="privateOrder">Create private encrypted order</Label>
      </div>

      {privateOrder && (
        <div>
          <Label htmlFor="selectedPool">Dark Pool</Label>
          <Select value={selectedPool} onValueChange={setSelectedPool}>
            <SelectTrigger>
              <SelectValue placeholder="Select dark pool" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whales">Whales Pool</SelectItem>
              <SelectItem value="institutions">Institutions Pool</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting || !peerId} className="w-full">
        {isSubmitting ? 'Submitting...' : 'Sign & Submit Order'}
      </Button>
    </form>
  );
}