import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface DarkPoolManagerProps {
  peerId: string;
}

export default function DarkPoolManager({ peerId }: DarkPoolManagerProps) {
  const [poolName, setPoolName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  const { toast } = useToast();

  const predefinedPools = [
    { name: 'whales', description: 'High-volume traders pool' },
    { name: 'institutions', description: 'Institutional traders pool' }
  ];

  async function handleJoinPool(e: React.FormEvent) {
    e.preventDefault();
    
    if (!poolName) {
      toast({
        title: "Error",
        description: "Please select or enter a pool name",
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

    setIsJoining(true);

    try {
      const response = await fetch('/api/darkpools/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolName, peerId }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Success",
          description: `Successfully joined pool: ${poolName}`
        });
        setPoolName('');
      } else {
        throw new Error(result.error || 'Failed to join pool');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to join pool: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select Dark Pool</Label>
        <Select value={poolName} onValueChange={setPoolName}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a pool or enter custom name below" />
          </SelectTrigger>
          <SelectContent>
            {predefinedPools.map((pool) => (
              <SelectItem key={pool.name} value={pool.name}>
                <div>
                  <div className="font-medium">{pool.name}</div>
                  <div className="text-sm text-muted-foreground">{pool.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customPool">Or Enter Custom Pool Name</Label>
        <Input
          id="customPool"
          placeholder="custom-pool-name"
          value={poolName}
          onChange={(e) => setPoolName(e.target.value)}
        />
      </div>

      <form onSubmit={handleJoinPool}>
        <Button 
          type="submit" 
          disabled={isJoining || !peerId || !poolName}
          className="w-full"
        >
          {isJoining ? 'Joining...' : 'Join Pool'}
        </Button>
      </form>

      <div className="mt-4 p-3 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Dark Pool Features</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Encrypted order sharing within pool members</li>
          <li>• Permission-based access control</li>
          <li>• Enhanced privacy for large trades</li>
          <li>• Reputation-based peer filtering</li>
        </ul>
      </div>
    </div>
  );
}