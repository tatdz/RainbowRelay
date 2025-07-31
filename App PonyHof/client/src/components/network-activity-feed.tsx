import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Network, Shield, Zap } from "lucide-react";
import type { NetworkActivity } from "@shared/schema";

export default function NetworkActivityFeed() {
  const { data: activities = [] } = useQuery({
    queryKey: ["/api/network/activity"],
    refetchInterval: 3000,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "order_filled":
        return <ArrowRightLeft className="text-green-500 text-sm" />;
      case "node_joined":
        return <Network className="text-blue-500 text-sm" />;
      case "order_propagated":
        return <Shield className="text-purple-500 text-sm" />;
      case "gasless_fill":
        return <Zap className="text-yellow-500 text-sm" />;
      default:
        return <Network className="text-gray-500 text-sm" />;
    }
  };

  const formatTimeAgo = (date: string | Date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  return (
    <Card className="bg-[hsl(217,33%,17%)] border-gray-700 card-glow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Network Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent network activity. Activity will appear here as orders are processed.
            </div>
          ) : (
            activities.map((activity: NetworkActivity) => (
              <div
                key={activity.id}
                className="flex items-start space-x-3 p-3 bg-[hsl(216,34%,23%)] rounded-lg"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-opacity-20 rounded-full flex items-center justify-center">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{activity.description}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {activity.pool && (
                      <span className="text-xs text-gray-400">{activity.pool} Pool</span>
                    )}
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(activity.createdAt)}
                    </span>
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
