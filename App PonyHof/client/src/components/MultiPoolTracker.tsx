import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PoolMembership {
  poolName: string;
  joinedAt: number;
  memberCount: number;
  isActive: boolean;
}

interface MultiPoolTrackerProps {
  currentUser: string;
}

export default function MultiPoolTracker({ currentUser }: MultiPoolTrackerProps) {
  const [memberships, setMemberships] = useState<PoolMembership[]>([]);
  const [selectedPool, setSelectedPool] = useState<string>('whales');

  const leavePool = async (poolName: string) => {
    try {
      const response = await fetch('/api/darkpools/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          poolName, 
          walletAddress: currentUser 
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to leave pool');
      }
      
      const result = await response.json();
      setMemberships(prev => prev.filter(p => p.poolName !== poolName));
      console.log(`Successfully left pool: ${poolName}`);
    } catch (error) {
      console.error('Failed to leave pool:', error);
    }
  };

  useEffect(() => {
    // Fetch user's pool memberships
    async function fetchMemberships() {
      try {
        const response = await fetch(`/api/user/${currentUser}/pools`);
        if (response.ok) {
          const data = await response.json();
          setMemberships(data.pools || []);
        }
      } catch (error) {
        console.error('Failed to fetch pool memberships:', error);
      }
    }

    if (currentUser) {
      fetchMemberships();
      const interval = setInterval(fetchMemberships, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-sm">
          <Users className="w-4 h-4" />
          <span>My Pool Memberships</span>
          <Badge variant="outline" className="ml-auto">
            {memberships.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberships.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">No pool memberships</p>
            <p className="text-xs">Join a dark pool to start trading</p>
          </div>
        ) : (
          <Tabs value={selectedPool} onValueChange={setSelectedPool}>
            <TabsList className="grid w-full grid-cols-2">
              {memberships.map((membership) => (
                <TabsTrigger 
                  key={membership.poolName} 
                  value={membership.poolName}
                  className="text-xs"
                >
                  {membership.poolName}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {memberships.map((membership) => (
              <TabsContent key={membership.poolName} value={membership.poolName}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${membership.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="text-sm font-medium">
                        {membership.poolName} Pool
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">{membership.memberCount} members</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => leavePool(membership.poolName)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs px-2 py-1"
                      >
                        Leave
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined: {new Date(membership.joinedAt).toLocaleDateString()}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}