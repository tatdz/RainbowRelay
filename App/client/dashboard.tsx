import { useState } from "react";
import Sidebar from "@/components/sidebar";
import WalletConnection from "@/components/wallet-connection";
import OrderForm from "@/components/order-form";
import ActiveOrdersTable from "@/components/active-orders-table";
import NetworkActivityFeed from "@/components/network-activity-feed";
import ReputationDashboard from "@/components/reputation-dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/hooks/use-wallet";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChartBar, Star, Zap } from "lucide-react";

export default function Dashboard() {
  const { isConnected, address } = useWallet();

  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/users", address, "stats"],
    enabled: !!address,
  });

  const { data: networkStats } = useQuery({
    queryKey: ["/api/network/stats"],
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-[hsl(215,28%,11%)] text-gray-100">
      <Sidebar />
      
      <div className="pl-64">
        {/* Header */}
        <header className="bg-[hsl(217,33%,17%)] border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">Trading Dashboard</h1>
              <p className="text-gray-400 text-sm mt-1">Decentralized encrypted order relay network</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-[hsl(216,34%,23%)] px-4 py-2 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-300">Sepolia Testnet</span>
              </div>
              
              <WalletConnection />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Active Orders</p>
                    <p className="text-2xl font-semibold text-white mt-1">
                      {statsLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        userStats?.activeOrders ?? 0
                      )}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <ChartBar className="text-blue-500 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Total Volume</p>
                    <p className="text-2xl font-semibold text-white mt-1">
                      {statsLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        userStats?.totalVolume ?? "$0"
                      )}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <ChartBar className="text-green-500 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Reputation Score</p>
                    <p className="text-2xl font-semibold text-white mt-1">
                      {isConnected ? "98.5" : "---"}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <Star className="text-purple-500 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Gas Saved</p>
                    <p className="text-2xl font-semibold text-white mt-1">
                      {statsLoading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        userStats?.gasSaved ?? "0 ETH"
                      )}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-500 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <Zap className="text-yellow-500 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Order Creation Form */}
            <div className="lg:col-span-1">
              <OrderForm />
            </div>

            {/* Active Orders and Live Feed */}
            <div className="lg:col-span-2 space-y-6">
              <ActiveOrdersTable />
              <NetworkActivityFeed />
            </div>
          </div>

          {/* Relay Reputation Dashboard */}
          <div className="mt-8">
            <ReputationDashboard />
          </div>
        </main>
      </div>
    </div>
  );
}
