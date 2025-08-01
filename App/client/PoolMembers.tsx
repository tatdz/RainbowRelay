import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";

interface PoolMember {
  peerId: string;
  address: string;
  status: 'online' | 'offline' | 'active';
  lastSeen: number;
  ordersSubmitted: number;
}

interface PoolMembersProps {
  poolName: string;
  currentUser: string;
}

export default function PoolMembers({ poolName, currentUser }: PoolMembersProps) {
  const [members, setMembers] = useState<PoolMember[]>([]);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  useEffect(() => {
    // Simulate pool members data - in real implementation, fetch from backend
    const mockMembers: PoolMember[] = [
      {
        peerId: currentUser,
        address: currentUser,
        status: 'active',
        lastSeen: Date.now(),
        ordersSubmitted: 3
      },
      {
        peerId: '12D3KooWExample1',
        address: '0x742d35Cc6473C4B4B0A5c3A2c4a3F5BAA4e8f1A2',
        status: 'online',
        lastSeen: Date.now() - 60000,
        ordersSubmitted: 7
      },
      {
        peerId: '12D3KooWExample2', 
        address: '0x742d35Cc6473C4B4B0A5c3A2c4a3F5BAA4e8f1A3',
        status: 'online',
        lastSeen: Date.now() - 300000,
        ordersSubmitted: 12
      },
      {
        peerId: '12D3KooWExample3',
        address: '0x742d35Cc6473C4B4B0A5c3A2c4a3F5BAA4e8f1A4',
        status: 'offline',
        lastSeen: Date.now() - 3600000,
        ordersSubmitted: 2
      }
    ];
    
    setMembers(mockMembers);
  }, [poolName, currentUser]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'online': return 'bg-blue-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    return status === 'offline' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />;
  };

  const formatLastSeen = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-sm">
          <Users className="w-4 h-4" />
          <span>{poolName} Pool Members</span>
          <Badge variant="outline" className="ml-auto">
            {members.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((member) => (
          <div key={member.peerId} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(member.status)}`} />
                <span className="text-sm font-medium">
                  {member.peerId === currentUser ? 'You' : member.address.slice(0, 8) + '...'}
                </span>
                {getStatusIcon(member.status)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(showDetails === member.peerId ? null : member.peerId)}
              >
                {showDetails === member.peerId ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>

            {showDetails === member.peerId && (
              <div className="text-xs space-y-1 pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={member.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {member.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last seen:</span>
                  <span>{formatLastSeen(member.lastSeen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Orders:</span>
                  <span>{member.ordersSubmitted}</span>
                </div>
                <div className="pt-1">
                  <span className="text-muted-foreground">Peer ID:</span>
                  <p className="font-mono text-xs break-all">{member.peerId}</p>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Enhanced privacy guaranteed</span>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Encrypted</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}