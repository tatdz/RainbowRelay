import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Star, TrendingUp, Clock, Wifi, Activity } from "lucide-react";

interface UserReputation {
  userId: string;
  reputation: number;
  ordersCompleted: number;
  totalVolume: number;
  successRate: number;
  lastActive: number;
}

interface NodeMetrics {
  nodeId: string;
  uptime: number;
  orderSuccessRate: number;
  tradingVolume: number;
  avgResponseTime: number;
  ordersProcessed: number;
  reputation: number;
  lastUpdated: number;
}

interface LeaderboardData {
  leaderboard: UserReputation[];
  topNodes: NodeMetrics[];
  currentUser: UserReputation | null;
  lastUpdated: number;
}

interface DynamicLeaderboardProps {
  currentUserId: string;
}

export default function DynamicLeaderboard({ currentUserId }: DynamicLeaderboardProps) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'users' | 'nodes'>('users');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`/api/reputation/leaderboard/${currentUserId}`);
        if (response.ok) {
          const leaderboardData = await response.json();
          setData(leaderboardData);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
    
    // Update every 2 seconds for real-time updates
    const interval = setInterval(fetchLeaderboard, 2000);
    return () => clearInterval(interval);
  }, [currentUserId]);

  const formatVolume = (volume: number): string => {
    return `${volume.toFixed(2)} ETH`;
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Star className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Star className="w-4 h-4 text-amber-600" />;
    return <span className="w-4 h-4 flex items-center justify-center text-xs font-bold text-muted-foreground">#{index + 1}</span>;
  };

  const getReputationColor = (reputation: number): string => {
    if (reputation >= 95) return "text-emerald-400";
    if (reputation >= 85) return "text-green-400";
    if (reputation >= 75) return "text-yellow-400";
    if (reputation >= 65) return "text-orange-400";
    return "text-red-400";
  };

  const getReputationBadge = (reputation: number): string => {
    if (reputation >= 95) return "Elite";
    if (reputation >= 85) return "Expert";
    if (reputation >= 75) return "Skilled";
    if (reputation >= 65) return "Active";
    return "Beginner";
  };

  if (loading) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span>Dynamic Leaderboard</span>
            <Badge variant="secondary" className="animate-pulse">Loading...</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center space-x-3 p-3 bg-muted rounded-lg animate-pulse">
                <div className="w-6 h-6 bg-muted-foreground/20 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted-foreground/20 rounded w-3/4" />
                  <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle>Dynamic Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Unable to load leaderboard data
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span>Dynamic Leaderboard</span>
            <Badge variant="default" className="animate-pulse bg-green-500/20 text-green-400 border-green-500/30">
              Live
            </Badge>
          </CardTitle>
          <div className="flex space-x-1">
            <button
              onClick={() => setView('users')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === 'users' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setView('nodes')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === 'nodes' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Nodes
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {view === 'users' ? 'Top traders by reputation' : 'Top relay nodes by performance'}
        </p>
      </CardHeader>
      <CardContent>
        {view === 'users' ? (
          <div className="space-y-3">
            {data.leaderboard.map((user, index) => {
              const isCurrentUser = user.userId.toLowerCase() === currentUserId.toLowerCase();
              return (
                <div
                  key={user.userId}
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${
                    isCurrentUser 
                      ? 'bg-primary/10 border border-primary/30 ring-1 ring-primary/20' 
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-center w-8 h-8">
                    {getRankIcon(index)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <code className="text-xs font-mono bg-background px-2 py-1 rounded truncate">
                        {isCurrentUser ? 'You' : `${user.userId.slice(0, 6)}...${user.userId.slice(-4)}`}
                      </code>
                      <Badge variant="outline" className={getReputationColor(user.reputation)}>
                        {getReputationBadge(user.reputation)}
                      </Badge>
                      
                      {isCurrentUser && (
                        <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          You
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center space-x-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>{user.successRate.toFixed(1)}% success</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Activity className="w-3 h-3" />
                        <span>{user.ordersCompleted} filled orders</span>
                      </span>
                      <span>{formatVolume(user.totalVolume)}</span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getReputationColor(user.reputation)}`}>
                      {user.reputation.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimeAgo(user.lastActive)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {data.topNodes.map((node, index) => (
              <div
                key={node.nodeId}
                className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8">
                  {getRankIcon(index)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <code className="text-xs font-mono bg-background px-2 py-1 rounded">
                      Node {node.nodeId.slice(-6)}
                    </code>
                    <Badge variant="outline" className={getReputationColor(node.reputation)}>
                      {getReputationBadge(node.reputation)}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center space-x-1">
                      <Wifi className="w-3 h-3" />
                      <span>{node.uptime.toFixed(1)}% uptime</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{node.avgResponseTime.toFixed(0)}ms</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Activity className="w-3 h-3" />
                      <span>{node.ordersProcessed} orders</span>
                    </span>
                    <span>{formatVolume(node.tradingVolume)}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-lg font-bold ${getReputationColor(node.reputation)}`}>
                    {node.reputation.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimeAgo(node.lastUpdated)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Last updated: {formatTimeAgo(data.lastUpdated)}</span>
            <span className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Real-time Sepolia Oracle</span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}