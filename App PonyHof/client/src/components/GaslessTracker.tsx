import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, ExternalLink } from "lucide-react";

interface GaslessTrackerProps {
  orderHash?: string;
  txHash?: string;
  gasless?: boolean;
  relayer?: string;
}

export default function GaslessTracker({ orderHash, txHash, gasless, relayer }: GaslessTrackerProps) {
  if (!gasless || !txHash) return null;

  const sepoliaExplorer = `https://sepolia.etherscan.io/tx/${txHash}`;

  return (
    <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-sm text-green-700 dark:text-green-300">
          <Zap className="w-4 h-4" />
          <span>Gasless Execution</span>
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            ⚡ Free
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-green-600 dark:text-green-400">
          <p>Order executed without gas fees!</p>
          <p className="text-xs mt-1">Relayer: {relayer || 'GasStationOnFill'}</p>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono bg-green-100 dark:bg-green-900 px-2 py-1 rounded">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.open(sepoliaExplorer, '_blank')}
            className="h-7 text-xs border-green-200 hover:bg-green-100 dark:border-green-800 dark:hover:bg-green-900"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            View on Sepolia
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Gas costs covered by relay network
        </div>
      </CardContent>
    </Card>
  );
}