import { useState, useEffect } from 'react';
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCircle, AlertCircle, Info, ExternalLink } from "lucide-react";

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description: string;
  action?: {
    label: string;
    url: string;
  };
  timestamp: number;
}

export default function NotificationCenter() {
  const { toast } = useToast();
  const [notifications] = useState<Notification[]>([]);

  // Simulated notification triggers
  useEffect(() => {
    // Pool joining notification
    const poolJoinTimer = setTimeout(() => {
      toast({
        title: "Pool Joined Successfully",
        description: "You've joined the Whales pool and can now view encrypted orders",
        duration: 5000,
      });
    }, 2000);

    // Order signing notification
    const orderSignTimer = setTimeout(() => {
      toast({
        title: "Order Signed",
        description: "Your limit order has been signed with MetaMask",
        duration: 4000,
      });
    }, 8000);

    // Removed redundant "Order Broadcast" notification - users can see orders in Live Orders table

    return () => {
      clearTimeout(poolJoinTimer);
      clearTimeout(orderSignTimer);
    };
  }, [toast]);

  // Real-time blockchain event notifications
  useEffect(() => {
    const handleBlockchainEvent = (event: any) => {
      switch (event.type) {
        case 'order_filled':
          toast({
            title: "Order Filled!",
            description: `Your order has been executed on-chain`,
            action: (
              <a
                href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-xs underline"
              >
                <ExternalLink className="w-3 h-3" />
                <span>View Transaction</span>
              </a>
            ),
            duration: 8000,
          });
          break;

        case 'order_cancelled':
          toast({
            title: "Order Cancelled",
            description: "Your order has been cancelled on-chain",
            variant: "destructive",
            duration: 5000,
          });
          break;

        case 'reputation_updated':
          toast({
            title: "Reputation Updated",
            description: `Your reputation score increased to ${event.newScore}`,
            duration: 4000,
          });
          break;
      }
    };

    // Listen for blockchain events (simulated)
    window.addEventListener('blockchain-event', handleBlockchainEvent);
    
    return () => {
      window.removeEventListener('blockchain-event', handleBlockchainEvent);
    };
  }, [toast]);

  return null; // Notifications are handled by the toast system
}

// Utility function to trigger notifications from other components
export const triggerNotification = (type: string, data: any = {}) => {
  const event = new CustomEvent('blockchain-event', {
    detail: { type, ...data }
  });
  window.dispatchEvent(event);
};