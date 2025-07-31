import { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import ReputationDetails from "./ReputationDetails";

interface PeerReputation {
  peerId: string;
  score: number;
  uptime: number;
  ordersProcessed: number;
  responseTime: number;
  successRate: number;
}

export default function ReputationList() {
  const [reputations, setReputations] = useState<PeerReputation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReputations() {
      try {
        const response = await fetch('/api/reputation/peers');
        const data = await response.json();
        setReputations(data);
      } catch (error) {
        console.error('Failed to fetch peer reputations:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchReputations();
    
    // Update every 30 seconds
    const interval = setInterval(fetchReputations, 30000);
    return () => clearInterval(interval);
  }, []);

  function getReputationColor(score: number) {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getReputationLabel(score: number) {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
            <div className="h-2 bg-muted rounded w-full"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reputations.length === 0 ? (
        <p className="text-muted-foreground text-center py-4">
          No relay nodes found
        </p>
      ) : (
        reputations.map((peer) => (
          <div key={peer.peerId} className="space-y-2 p-3 border rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {peer.peerId.slice(0, 12)}...
                </code>
                <Badge variant="secondary">
                  {getReputationLabel(peer.score)}
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{peer.score}/100</span>
                <ReputationDetails peer={peer} />
              </div>
            </div>
            <div className="space-y-1">
              <Progress 
                value={peer.score} 
                className="h-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Reputation Score</span>
                <span>{peer.score}%</span>
              </div>
            </div>
          </div>
        ))
      )}
      
      <div className="mt-4 p-3 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Reputation Factors</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Order success rate and execution quality</li>
          <li>• Network uptime and responsiveness</li>
          <li>• Trading volume and frequency</li>
          <li>• Peer feedback and endorsements</li>
        </ul>
      </div>
    </div>
  );
}