import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Zap, Shield, Clock, CheckCircle2 } from "lucide-react";

interface GaslessOrderTrackerProps {
  orderHash: string;
  txHash?: string;
  gasStationContract?: string;
  gasless?: boolean;
  frontRunProtection?: boolean;
  smoothExecution?: boolean;
}

export default function GaslessOrderTracker({ 
  orderHash, 
  txHash, 
  gasStationContract = "0x14d4dfc203f1a1a748cbecdc2ac70a60d7f9d010",
  gasless = true,
  frontRunProtection = true,
  smoothExecution = true
}: GaslessOrderTrackerProps) {
  
  const features = [
    {
      icon: <Zap className="w-4 h-4" />,
      label: "Gasless Execution",
      active: gasless,
      description: "No gas fees paid by user"
    },
    {
      icon: <Shield className="w-4 h-4" />,
      label: "Front-Run Protection", 
      active: frontRunProtection,
      description: "Encrypted order prevents MEV attacks"
    },
    {
      icon: <CheckCircle2 className="w-4 h-4" />,
      label: "Smooth Execution",
      active: smoothExecution,
      description: "Optimized for minimal slippage"
    }
  ];

  return (
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 dark:border-green-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center space-x-2">
          <Zap className="w-4 h-4 text-green-600" />
          <span>GasStationOnFill Integration</span>
          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            Gasless
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Features Grid */}
        <div className="grid grid-cols-1 gap-2">
          {features.map((feature, index) => (
            <div 
              key={index}
              className={`flex items-center space-x-3 p-2 rounded-md ${
                feature.active 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}
            >
              <div className={feature.active ? 'text-green-600' : 'text-gray-400'}>
                {feature.icon}
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium">{feature.label}</span>
                <p className="text-xs opacity-75">{feature.description}</p>
              </div>
              {feature.active && (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              )}
            </div>
          ))}
        </div>

        {/* Contract Info */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">GasStationOnFill Contract:</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-green-100 dark:hover:bg-green-900/20"
              onClick={() => window.open(`https://sepolia.etherscan.io/address/${gasStationContract}`, '_blank')}
            >
              <code className="text-green-600">{gasStationContract.slice(0, 8)}...</code>
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Transaction Link */}
        {txHash && (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Sepolia Transaction:</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/20"
                onClick={() => window.open(`https://sepolia.etherscan.io/tx/${txHash}`, '_blank')}
              >
                <code className="text-blue-600">{txHash.slice(0, 8)}...{txHash.slice(-6)}</code>
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Real-time Status */}
        <div className="bg-green-50 dark:bg-green-950/50 p-2 rounded-md">
          <div className="flex items-center space-x-2 text-xs">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-700 dark:text-green-300 font-medium">
              Gasless fill powered by GasStationOnFill contract
            </span>
          </div>
          <p className="text-green-600 dark:text-green-400 text-xs mt-1">
            Order executed with zero gas fees and MEV protection
          </p>
        </div>
      </CardContent>
    </Card>
  );
}