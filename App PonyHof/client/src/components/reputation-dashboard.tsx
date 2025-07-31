import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Star, Wifi, Clock, Gauge } from "lucide-react";
import type { RelayNode } from "@shared/schema";

export default function ReputationDashboard() {
  const { data: relayNodes = [] } = useQuery({
    queryKey: ["/api/network/relay-nodes"],
    refetchInterval: 10000,
  });

  const formatUptime = (uptime: string) => {
    const uptimeNum = parseFloat(uptime);
    return `${uptimeNum.toFixed(1)}%`;
  };

  const formatResponseTime = (responseTime: number) => {
    return `${responseTime}ms`;
  };

  return (
    <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Relay Network Reputation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {relayNodes.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              No relay nodes available. Nodes will appear here as they join the network.
            </div>
          ) : (
            relayNodes.map((node: RelayNode) => (
              <div
                key={node.id}
                className="bg-[hsl(216,34%,23%)] border border-gray-600 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${node.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-medium text-white">
                      Relay Node #{node.peerId.slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Star className="text-yellow-400 text-xs w-3 h-3" />
                    <span className="text-sm text-white">
                      {parseFloat(node.reputationScore).toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <div className="flex items-center space-x-1">
                      <Gauge className="w-3 h-3" />
                      <span>Uptime:</span>
                    </div>
                    <span className="text-white">{formatUptime(node.uptime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <div className="flex items-center space-x-1">
                      <Wifi className="w-3 h-3" />
                      <span>Orders Processed:</span>
                    </div>
                    <span className="text-white">{node.ordersProcessed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Response Time:</span>
                    </div>
                    <span className="text-white">{formatResponseTime(node.averageResponseTime)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
