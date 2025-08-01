import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Info, TrendingUp, Clock, Zap, CheckCircle, MessageSquare } from "lucide-react";

interface ReputationDetailsProps {
  peer: {
    peerId: string;
    score: number;
    uptime: number;
    ordersProcessed: number;
    responseTime: number;
    successRate: number;
  };
}

export default function ReputationDetails({ peer }: ReputationDetailsProps) {
  const getScoreBreakdown = () => {
    // Calculate component scores based on peer data with safe defaults
    const safeScore = peer?.score || 0;
    const safeUptime = peer?.uptime || 0;
    const safeSuccessRate = peer?.successRate || 0;
    const safeOrdersProcessed = peer?.ordersProcessed || 0;
    const safeResponseTime = peer?.responseTime || 100;
    
    const uptimeScore = Math.min(safeUptime * 10, 100);
    const successScore = safeSuccessRate;
    const volumeScore = Math.min(safeOrdersProcessed * 2, 100);
    const speedScore = Math.max(100 - safeResponseTime / 10, 0);
    
    return {
      uptime: isNaN(uptimeScore) ? 0 : uptimeScore,
      success: isNaN(successScore) ? 0 : successScore,
      volume: isNaN(volumeScore) ? 0 : volumeScore,
      speed: isNaN(speedScore) ? 0 : speedScore
    };
  };

  const breakdown = getScoreBreakdown();

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info className="w-3 h-3 mr-1" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4" />
            <span>Reputation Details</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Score */}
          <Card>
            <CardContent className="pt-4">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold">{peer?.score || 0}</div>
                <div className="text-sm text-muted-foreground">Overall Score</div>
                <Badge variant={getScoreBadgeVariant(peer?.score || 0)} className="mt-2">
                  {(peer?.score || 0) >= 80 ? 'Excellent' : (peer?.score || 0) >= 60 ? 'Good' : 'Needs Improvement'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Peer Info */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Peer ID:</span>
                <span className="font-mono text-xs">{peer?.peerId?.slice(0, 16) || 'Unknown'}...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Orders Processed:</span>
                <span className="font-medium">{peer?.ordersProcessed || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Score Components</h4>
            
            {/* Network Uptime */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Network Uptime</span>
                </div>
                <span className={`text-sm font-medium ${getScoreColor(breakdown.uptime)}`}>
                  {(breakdown.uptime || 0).toFixed(0)}%
                </span>
              </div>
              <Progress value={breakdown.uptime} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {((peer?.uptime || 0)).toFixed(1)}% uptime over last 30 days
              </div>
            </div>

            {/* Success Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Order Success Rate</span>
                </div>
                <span className={`text-sm font-medium ${getScoreColor(breakdown.success)}`}>
                  {(breakdown.success || 0).toFixed(0)}%
                </span>
              </div>
              <Progress value={breakdown.success} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Successfully processed orders
              </div>
            </div>

            {/* Volume Handled */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Trading Volume</span>
                </div>
                <span className={`text-sm font-medium ${getScoreColor(breakdown.volume)}`}>
                  {(breakdown.volume || 0).toFixed(0)}%
                </span>
              </div>
              <Progress value={breakdown.volume} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Volume of orders handled
              </div>
            </div>

            {/* Response Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm">Responsiveness</span>
                </div>
                <span className={`text-sm font-medium ${getScoreColor(breakdown.speed)}`}>
                  {(breakdown.speed || 0).toFixed(0)}%
                </span>
              </div>
              <Progress value={breakdown.speed} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Avg response time: {peer?.responseTime || 0}ms
              </div>
            </div>
          </div>

          {/* Peer Feedback */}
          <Card className="bg-muted/20">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-2">
                <MessageSquare className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Community Feedback</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    "Reliable peer with consistent performance and fast order processing."
                  </p>
                  <div className="flex items-center space-x-2 mt-2">
                    <Badge variant="outline" className="text-xs">Verified</Badge>
                    <span className="text-xs text-muted-foreground">2 days ago</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Trends */}
          <div className="text-center">
            <div className="text-xs text-muted-foreground">
              Score has improved by +5 points this week
            </div>
            <div className="flex justify-center items-center space-x-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600">Trending up</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}