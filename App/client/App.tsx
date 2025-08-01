import { useEffect, useState } from 'react';
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrderForm from "./components/OrderForm";
import ReputationList from "./components/ReputationList";
import DynamicLeaderboard from "./components/DynamicLeaderboard";
import DarkPoolManager from "./components/DarkPoolManager";
import MultiPoolTracker from "./components/MultiPoolTracker";
import PoolMembers from "./components/PoolMembers";
import OrderDetails from "./components/OrderDetails";
import ReputationDetails from "./components/ReputationDetails";
import NotificationCenter from "./components/NotificationCenter";
import OrderLifecycle from "./components/OrderLifecycle";
import SepoliaTracker from "./components/SepoliaTracker";
import GaslessOrderTracker from "./components/GaslessOrderTracker";
import ThemeToggle from "./components/ThemeToggle";
import NotFound from "@/pages/not-found";
import logoSvg from "@/assets/logo.svg";
import wordmarkSvg from "@/assets/wordmark.svg";

const BACKEND_URLS = [
  '', // Same origin - backend runs on same port as frontend
];

function PonyHofApp() {
  const [peerId, setPeerId] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<{[key: string]: any}>({});
  const [selectedPool, setSelectedPool] = useState('whales');

  // Get connected wallet address as peerId
  useEffect(() => {
    const getPeerId = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ 
            method: 'eth_accounts' 
          });
          if (accounts.length > 0) {
            setPeerId(accounts[0]);
          } else {
            // Try to request access if no accounts
            const requestedAccounts = await window.ethereum.request({
              method: 'eth_requestAccounts'
            });
            if (requestedAccounts.length > 0) {
              setPeerId(requestedAccounts[0]);
            }
          }
        } catch (error) {
          console.error('Failed to connect wallet:', error);
          // Set a demo address for testing without wallet
          setPeerId('0x742d35Cc6634C0532925a3b8D9');
        }
      } else {
        // Set a demo address for testing without MetaMask
        setPeerId('0x742d35Cc6634C0532925a3b8D9');
      }
    };
    getPeerId();
  }, []);

  // Fetch orders from backend
  async function fetchFromBackends() {
    try {
      const results = await Promise.all(
        BACKEND_URLS.map(async (url) => {
          try {
            const res = await fetch(`${url}/api/orders`);
            if (!res.ok) throw new Error('Failed to fetch');
            return res.json();
          } catch {
            return [];
          }
        })
      );

      const merged: {[key: string]: any} = {};
      for (const list of results) {
        for (const o of list) {
          const key = JSON.stringify(o.order || o);
          merged[key] = o;
        }
      }
      setOrders(Object.values(merged));
    } catch (e) {
      console.error('Fetch from backends error', e);
    }
  }

  useEffect(() => {
    fetchFromBackends();
    const interval = setInterval(fetchFromBackends, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch order statuses
  useEffect(() => {
    orders.forEach(async (o) => {
      try {
        const hashData = JSON.stringify(o);
        const hash = btoa(hashData).substring(0, 16); // Simple hash for demo
        
        for (const backendUrl of BACKEND_URLS) {
          try {
            const res = await fetch(`${backendUrl}/api/order-status/${hash}`);
            if (res.ok) {
              const status = await res.json();
              setOrderStatuses((prev) => ({ ...prev, [hash]: status }));
              break;
            }
          } catch {}
        }
      } catch (e) {
        console.error('Error fetching order status:', e);
      }
    });
  }, [orders]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 max-w-7xl">
          <div className="flex items-center space-x-4">
            <img src={logoSvg} alt="PonyHof Logo" className="w-10 h-8" />
            <div>
              <img src={wordmarkSvg} alt="PonyHof" className="w-32 h-6" />
              <p className="text-xs text-muted-foreground hidden md:block">
                Decentralized Encrypted Dark Pool Trading
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {peerId ? (
              <Badge variant="outline" className="hidden sm:flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs">{peerId.slice(0, 8)}...</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="hidden sm:flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-xs">Connect Wallet</span>
              </Badge>
            )}
            <Badge variant="outline" className="hidden lg:flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Sepolia</span>
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-7xl">

      {/* Main Layout - Fixed 3 Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-screen">
        {/* Left Column - Order Creation & Pool Access */}
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Create Limit Order</CardTitle>
              <p className="text-sm text-muted-foreground">
                Sign with MetaMask for transparent trading
              </p>
            </CardHeader>
            <CardContent>
              <OrderForm peerId={peerId} onOrderSubmitted={fetchFromBackends} />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Dark Pool Access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Join encrypted pools for private trading
              </p>
            </CardHeader>
            <CardContent>
              <DarkPoolManager peerId={peerId} />
            </CardContent>
          </Card>

          <div className="hidden lg:block">
            <MultiPoolTracker currentUser={peerId} />
          </div>
        </div>

        {/* Center Column - Live Orders */}
        <div className="space-y-6">
          {/* Live Orders */}
          <Card className="min-h-[500px]">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center justify-between">
                Live Orders ({orders.length})
                {orders.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    Active
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-2xl">📋</span>
                  </div>
                  <h3 className="text-lg font-medium mb-2">No orders yet</h3>
                  <p className="text-sm">Create your first limit order to get started with dark pool trading.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {orders.map((o, i) => {
                    const hashData = JSON.stringify(o);
                    const hash = btoa(hashData).substring(0, 16);
                    const status = orderStatuses[hash] || {};

                    if (o.encrypted) {
                      return (
                        <Card key={i} className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border-purple-200 dark:border-purple-800">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                                <span className="text-sm font-mono font-semibold text-purple-700 dark:text-purple-300">
                                  [Encrypted Order]
                                </span>
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                  {o.poolName}
                                </Badge>
                              </div>
                              <OrderDetails 
                                order={o} 
                                orderHash={hash} 
                                orderStatus={status}
                                canDecrypt={true}
                              />
                            </div>
                            <OrderLifecycle order={o} orderStatus={status} />
                            
                            {/* GasStationOnFill Integration for Encrypted Orders */}
                            <div className="mt-3">
                              <GaslessOrderTracker 
                                orderHash={hash}
                                txHash={status.fill?.txHash}
                                gasStationContract="0x14d4dfc203f1a1a748cbecdc2ac70a60d7f9d010"
                                gasless={true}
                                frontRunProtection={true}
                                smoothExecution={true}
                              />
                            </div>
                            
                            <p className="text-xs text-muted-foreground">
                              Submitted: {new Date(o.submittedAt).toLocaleTimeString()}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    }

                    return (
                      <Card key={i} className="hover:bg-muted/20 transition-colors">
                        <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">
                            Maker: {o.order?.maker?.slice(0, 8)}...
                          </p>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <span>Making: {((parseFloat(o.order?.makingAmount || '0') / 1e18).toFixed(4))}</span>
                            <span>•</span>
                            <span>Taking: {((parseFloat(o.order?.takingAmount || '0') / 1e18).toFixed(4))}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={
                            o.status === 'filled' ? 'default' : 
                            o.status === 'cancelled' ? 'destructive' : 
                            'secondary'
                          }>
                            {o.status === 'filled' ? 'Filled' : o.status === 'cancelled' ? 'Cancelled' : 'Open'}
                          </Badge>
                          <OrderDetails 
                            order={o} 
                            orderHash={hash} 
                            orderStatus={status}
                            canDecrypt={false}
                          />
                        </div>
                      </div>
                      <OrderLifecycle order={o} orderStatus={status} />
                      
                      {/* GasStationOnFill Gasless Execution Tracker */}
                      <div className="mt-3">
                        <GaslessOrderTracker 
                          orderHash={hash}
                          txHash={status.fill?.txHash}
                          gasStationContract="0x14d4dfc203f1a1a748cbecdc2ac70a60d7f9d010"
                          gasless={true}
                          frontRunProtection={true}
                          smoothExecution={true}
                        />
                      </div>
                      
                      {/* Sepolia Blockchain Tracking */}
                      {status.fill?.txHash && (
                        <div className="mt-3">
                          <SepoliaTracker 
                            orderHash={hash}
                            txHash={status.fill.txHash}
                            blockNumber={status.fill.blockNumber}
                          />
                        </div>
                      )}
                      
                      {status.cancel?.txHash && (
                        <div className="mt-3">
                          <SepoliaTracker 
                            orderHash={hash}
                            txHash={status.cancel.txHash}
                            blockNumber={status.cancel.blockNumber}
                          />
                        </div>
                      )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Reputation & Stats */}
        <div className="space-y-6">
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 h-fit">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">🏆 Reputation Leaderboard</CardTitle>
                <Badge variant="default" className="animate-pulse">
                  Live
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Relay node performance & trust scores
              </p>
            </CardHeader>
            <CardContent>
              <DynamicLeaderboard currentUserId={peerId} />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Network Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Orders</span>
                  <Badge variant="outline" className="font-mono">
                    {orders.length}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pool Members</span>
                  <Badge variant="outline" className="font-mono">
                    12
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">24h Volume</span>
                  <Badge variant="outline" className="font-mono">
                    $2.4M
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Network</span>
                  <Badge variant="default" className="bg-blue-600">
                    Sepolia
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:block hidden">
            <PoolMembers poolName={selectedPool} currentUser={peerId} />
          </div>
        </div>
      </div>
      </main>

      {/* Notification Center */}
      <NotificationCenter />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PonyHofApp} />
      <Route path="/dashboard" component={PonyHofApp} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
