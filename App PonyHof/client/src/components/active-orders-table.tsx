import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X, CheckCircle, Clock, Loader2, Lock, ExternalLink, Zap } from "lucide-react";
import GaslessOrderTracker from "./GaslessOrderTracker";
import type { Order } from "@shared/schema";



export default function ActiveOrdersTable() {
  const { address } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["/api/orders"],
    refetchInterval: 2000, // Refresh every 2 seconds to catch status updates
  }) as { data: any[], isLoading: boolean };

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("DELETE", `/api/orders/${orderId}`),
    onSuccess: () => {
      toast({
        title: "Order Cancelled",
        description: "Your order has been cancelled successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/network/activity"] });
    },
    onError: (error) => {
      toast({
        title: "Cancellation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-900 text-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "matched":
        return (
          <Badge variant="secondary" className="bg-blue-900 text-blue-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Matched
          </Badge>
        );
      case "filled":
        return (
          <Badge variant="secondary" className="bg-green-900 text-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            On Chain
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="bg-red-900 text-red-300">
            <X className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-gray-900 text-gray-300">
            {status}
          </Badge>
        );
    }
  };

  const getPoolBadge = (pool: string) => {
    switch (pool) {
      case "whales":
        return (
          <Badge variant="secondary" className="bg-blue-900 text-blue-300">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"/>
            </svg>
            Whales
          </Badge>
        );
      case "institutions":
        return (
          <Badge variant="secondary" className="bg-purple-900 text-purple-300">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z"/>
            </svg>
            Institutions
          </Badge>
        );
      default:
        return <Badge variant="secondary">{pool}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">My Active Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">My Active Orders</CardTitle>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full pulse-dot"></div>
            <span className="text-sm text-green-500">Live</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 text-gray-400 font-medium">Pair</th>
                <th className="text-left py-3 text-gray-400 font-medium">Amount</th>
                <th className="text-left py-3 text-gray-400 font-medium">Rate</th>
                <th className="text-left py-3 text-gray-400 font-medium">Pool</th>
                <th className="text-left py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No active orders found. Create your first order to get started.
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => {
                  // Extract proper token info from order data
                  const getTokenPair = () => {
                    if (order.encrypted && !order.order) {
                      return "[Encrypted Order]";
                    }
                    // For unencrypted orders, extract from order.order
                    if (order.order) {
                      const makerAsset = order.order.makerAsset?.slice(-4) || "????";
                      const takerAsset = order.order.takerAsset?.slice(-4) || "????";
                      return `${makerAsset}/${takerAsset}`;
                    }
                    return "Unknown/Unknown";
                  };

                  const getAmount = () => {
                    if (order.encrypted && !order.order) {
                      return "[Encrypted]";
                    }
                    if (order.order?.makingAmount) {
                      return (parseFloat(order.order.makingAmount) / 1e18).toFixed(2);
                    }
                    return "0";
                  };

                  const getPool = () => {
                    if (order.encrypted) {
                      return order.poolName || "whales";
                    }
                    return "public";
                  };

                  return (
                    <tr key={order.id} className="border-b border-gray-800">
                      <td className="py-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{getTokenPair()}</span>
                          {order.encrypted && <Lock className="w-3 h-3 text-purple-400" />}
                        </div>
                      </td>
                      <td className="py-4">{getAmount()}</td>
                      <td className="py-4">Market</td>
                      <td className="py-4">{getPoolBadge(getPool())}</td>
                      <td className="py-4">{getStatusBadge(order.status)}</td>
                      <td className="py-4">
                        <div className="flex space-x-2">
                          {/* GasStationOnFill Gasless Fill Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                            onClick={() => window.open(`https://sepolia.etherscan.io/address/0x14d4dfc203f1a1a748cbecdc2ac70a60d7f9d010`, '_blank')}
                            title="Powered by GasStationOnFill - Gasless execution"
                          >
                            <Zap className="w-4 h-4" />
                          </Button>

                          {order.status === "filled" && order.fillTxHash && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-400 hover:text-green-300"
                              onClick={() => window.open(`https://sepolia.etherscan.io/tx/${order.fillTxHash}`, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                          {(order.status === "pending" || order.status === "matched") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelOrderMutation.mutate(order.id)}
                              disabled={cancelOrderMutation.isPending}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            >
                              {cancelOrderMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
