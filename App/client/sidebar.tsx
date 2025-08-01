import { Link, useLocation } from "wouter";
import { 
  ChartLine, 
  Waves, 
  History, 
  Network, 
  Star, 
  Wifi,
  Users
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Sidebar() {
  const [location] = useLocation();

  const { data: networkStats } = useQuery({
    queryKey: ["/api/network/stats"],
    refetchInterval: 5000,
  });

  const navItems = [
    { path: "/", label: "Trading Dashboard", icon: ChartLine, active: location === "/" },
    { path: "/pools", label: "Dark Pools", icon: Waves },
    { path: "/history", label: "Order History", icon: History },
    { path: "/network", label: "Relay Network", icon: Network },
    { path: "/reputation", label: "Reputation", icon: Star },
  ];

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-[hsl(217,33%,17%)] border-r border-gray-700">
      {/* Logo Section */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
              <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
            </svg>
          </div>
          <span className="text-xl font-bold silkscreen text-white">PonyHof</span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="mt-8 px-4">
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  item.active
                    ? "bg-blue-500 bg-opacity-20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-[hsl(216,34%,23%)]"
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Network Status */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">IPFS Status</span>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full pulse-dot"></div>
              <span className="text-green-500">
                {networkStats?.ipfsStatus?.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Sepolia Network</span>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full pulse-dot"></div>
              <span className="text-green-500">
                {networkStats?.blockchainStatus?.connected ? "Synced" : "Disconnected"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Peers</span>
            <span className="text-white font-medium">{networkStats?.peerCount ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
