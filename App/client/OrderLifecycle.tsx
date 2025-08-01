import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Lock, Send, Zap, X } from "lucide-react";
import GaslessTracker from "./GaslessTracker";

interface OrderLifecycleProps {
  order: any;
  orderStatus: any;
}

interface LifecycleStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'pending' | 'failed';
  timestamp?: number;
  description: string;
}

export default function OrderLifecycle({ order, orderStatus }: OrderLifecycleProps) {
  const getSteps = (): LifecycleStep[] => {
    const baseSteps: LifecycleStep[] = [
      {
        id: 'created',
        label: 'Order Created',
        icon: <Circle className="w-4 h-4" />,
        status: 'completed',
        timestamp: order.submittedAt || Date.now(),
        description: 'Order parameters defined and validated'
      }
    ];

    if (order.encrypted) {
      baseSteps.push({
        id: 'encrypted',
        label: 'Encrypted',
        icon: <Lock className="w-4 h-4" />,
        status: 'completed',
        timestamp: order.submittedAt || Date.now(),
        description: `Encrypted for ${order.poolName} pool`
      });
    } else {
      baseSteps.push({
        id: 'signed',
        label: 'Signed',
        icon: <CheckCircle className="w-4 h-4" />,
        status: order.signature ? 'completed' : 'current',
        timestamp: order.submittedAt || Date.now(),
        description: 'Signed with MetaMask (EIP712)'
      });
    }

    baseSteps.push({
      id: 'broadcast',
      label: 'Broadcast',
      icon: <Send className="w-4 h-4" />,
      status: 'completed',
      timestamp: (order.submittedAt || Date.now()) + 1000,
      description: 'Propagated to P2P network'
    });

    baseSteps.push({
      id: 'confirmed',
      label: 'On-Chain',
      icon: <Zap className="w-4 h-4" />,
      status: order.status === 'filled' || order.status === 'cancelled' ? 'completed' : 'pending',
      timestamp: order.fillTxHash ? order.filledAt || Date.now() : undefined,
      description: 'Registered on Ethereum Sepolia'
    });

    if (order.status === 'filled') {
      baseSteps.push({
        id: 'filled',
        label: 'Filled',
        icon: <CheckCircle className="w-4 h-4" />,
        status: 'completed',
        timestamp: order.filledAt || Date.now(),
        description: 'Order successfully executed'
      });
    } else if (order.status === 'cancelled') {
      baseSteps.push({
        id: 'cancelled',
        label: 'Cancelled',
        icon: <X className="w-4 h-4" />,
        status: 'failed',
        timestamp: order.cancelledAt || Date.now(),
        description: 'Order was cancelled'
      });
    } else {
      baseSteps.push({
        id: 'matching',
        label: 'Matching',
        icon: <Circle className="w-4 h-4" />,
        status: 'current',
        description: 'Waiting for counterparty'
      });
    }

    return baseSteps;
  };

  const steps = getSteps();
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / steps.length) * 100;

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'current': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-400';
    }
  };

  const getStepBg = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 border-green-300';
      case 'current': return 'bg-blue-100 border-blue-300 animate-pulse';
      case 'failed': return 'bg-red-100 border-red-300';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Order Lifecycle</h4>
            <Badge variant="outline">
              {completedSteps}/{steps.length} steps
            </Badge>
          </div>

          <Progress value={progress} className="h-2" />

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start space-x-3">
                <div className={`p-2 rounded-full border-2 ${getStepBg(step.status)}`}>
                  <div className={getStepColor(step.status)}>
                    {step.icon}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-medium ${getStepColor(step.status)}`}>
                      {step.label}
                    </p>
                    {step.timestamp && (
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(step.timestamp)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Current Status */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Status:</span>
              <Badge 
                variant={
                  order.status === 'filled' ? 'default' : 
                  order.status === 'cancelled' ? 'destructive' : 
                  'secondary'
                }
              >
                {order.status === 'filled' ? 'Filled' : 
                 order.status === 'cancelled' ? 'Cancelled' : 
                 'Active'}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
      
      {/* Gasless Execution Tracker */}
      {orderStatus.fill?.gasless && (
        <CardContent className="pt-0">
          <GaslessTracker 
            orderHash={orderStatus.orderHash}
            txHash={orderStatus.fill.txHash}
            gasless={orderStatus.fill.gasless}
            relayer={orderStatus.fill.relayer}
          />
        </CardContent>
      )}
    </Card>
  );
}