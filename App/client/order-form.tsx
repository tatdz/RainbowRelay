import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";
import { signEIP712Order } from "@/lib/ethereum";
import { PenTool, Loader2 } from "lucide-react";

const orderSchema = z.object({
  fromToken: z.string().min(1, "From token is required"),
  toToken: z.string().min(1, "To token is required"),
  amount: z.string().min(1, "Amount is required"),
  rate: z.string().min(1, "Rate is required"),
  pool: z.enum(["whales", "institutions"], {
    required_error: "Please select a dark pool",
  }),
});

type OrderFormData = z.infer<typeof orderSchema>;

export default function OrderForm() {
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
  });

  const selectedPool = watch("pool");

  const createOrderMutation = useMutation({
    mutationFn: async (data: OrderFormData) => {
      if (!address) throw new Error("Wallet not connected");

      // Sign the order with EIP712
      const signature = await signEIP712Order({
        fromToken: data.fromToken,
        toToken: data.toToken,
        amount: data.amount,
        rate: data.rate,
        pool: data.pool,
        maker: address,
      });

      // Encrypt order data (simplified)
      const encryptedData = btoa(JSON.stringify({
        fromToken: data.fromToken,
        toToken: data.toToken,
        amount: data.amount,
        rate: data.rate,
        maker: address,
        timestamp: Date.now(),
      }));

      return apiRequest("POST", "/api/orders", {
        ...data,
        signature,
        encryptedData,
        walletAddress: address,
      });
    },
    onSuccess: () => {
      toast({
        title: "Order Created",
        description: "Your order has been signed and submitted to the network",
      });
      reset();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/network/activity"] });
    },
    onError: (error) => {
      toast({
        title: "Order Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OrderFormData) => {
    if (!isConnected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to create orders",
        variant: "destructive",
      });
      return;
    }
    createOrderMutation.mutate(data);
  };

  return (
    <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Create Order</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Pool Selection */}
          <div>
            <Label className="text-sm font-medium text-gray-300 mb-3 block">Dark Pool</Label>
            <RadioGroup
              value={selectedPool}
              onValueChange={(value) => setValue("pool", value as "whales" | "institutions")}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="whales" id="whales" />
                <Label htmlFor="whales" className="text-sm text-gray-300 cursor-pointer">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-blue-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z"/>
                    </svg>
                    Whales Pool
                    <span className="text-xs text-gray-500 block">High volume traders</span>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="institutions" id="institutions" />
                <Label htmlFor="institutions" className="text-sm text-gray-300 cursor-pointer">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-purple-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    </svg>
                    Institutions Pool
                    <span className="text-xs text-gray-500 block">Verified institutions</span>
                  </div>
                </Label>
              </div>
            </RadioGroup>
            {errors.pool && (
              <p className="text-red-500 text-xs mt-1">{errors.pool.message}</p>
            )}
          </div>

          {/* Token Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-300 mb-2 block">From Token</Label>
              <Select onValueChange={(value) => setValue("fromToken", value)}>
                <SelectTrigger className="bg-[hsl(216,34%,23%)] border-gray-600 text-white">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(216,34%,23%)] border-gray-600">
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="DAI">DAI</SelectItem>
                  <SelectItem value="WBTC">WBTC</SelectItem>
                </SelectContent>
              </Select>
              {errors.fromToken && (
                <p className="text-red-500 text-xs mt-1">{errors.fromToken.message}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-300 mb-2 block">To Token</Label>
              <Select onValueChange={(value) => setValue("toToken", value)}>
                <SelectTrigger className="bg-[hsl(216,34%,23%)] border-gray-600 text-white">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(216,34%,23%)] border-gray-600">
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                  <SelectItem value="DAI">DAI</SelectItem>
                  <SelectItem value="WBTC">WBTC</SelectItem>
                </SelectContent>
              </Select>
              {errors.toToken && (
                <p className="text-red-500 text-xs mt-1">{errors.toToken.message}</p>
              )}
            </div>
          </div>

          {/* Amount and Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-300 mb-2 block">Amount</Label>
              <Input
                {...register("amount")}
                type="number"
                step="0.000001"
                placeholder="0.00"
                className="bg-[hsl(216,34%,23%)] border-gray-600 text-white"
              />
              {errors.amount && (
                <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-300 mb-2 block">Rate</Label>
              <Input
                {...register("rate")}
                type="number"
                step="0.01"
                placeholder="0.00"
                className="bg-[hsl(216,34%,23%)] border-gray-600 text-white"
              />
              {errors.rate && (
                <p className="text-red-500 text-xs mt-1">{errors.rate.message}</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!isConnected || createOrderMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3"
          >
            {createOrderMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PenTool className="w-4 h-4 mr-2" />
            )}
            Sign & Submit Order
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
