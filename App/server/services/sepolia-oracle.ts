import { ethers } from 'ethers';

interface NodeMetrics {
  nodeId: string;
  uptime: number; // percentage
  orderSuccessRate: number; // percentage
  tradingVolume: number; // ETH equivalent
  avgResponseTime: number; // milliseconds
  ordersProcessed: number;
  reputation: number; // 0-100
  lastUpdated: number;
}

interface UserReputation {
  userId: string;
  reputation: number;
  ordersCompleted: number;
  totalVolume: number;
  successRate: number;
  lastActive: number;
}

class SepoliaOracle {
  private provider: ethers.JsonRpcProvider | null = null;
  private nodeMetrics: Map<string, NodeMetrics> = new Map();
  private userReputations: Map<string, UserReputation> = new Map();
  private lastBlockProcessed = 0;

  constructor() {
    this.initializeProvider();
    this.seedInitialData();
    this.startMetricsUpdater();
  }

  private async initializeProvider() {
    try {
      const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Get current block to start monitoring
      const currentBlock = await this.provider.getBlockNumber();
      this.lastBlockProcessed = currentBlock;
      console.log(`📊 Sepolia Oracle initialized at block ${currentBlock}`);
    } catch (error) {
      console.error('Failed to initialize Sepolia Oracle:', error);
    }
  }

  private seedInitialData() {
    // Seed realistic node metrics
    const nodeIds = [
      '12D3KooWExample1',
      '12D3KooWExample2', 
      '12D3KooWExample3',
      '12D3KooWExample4',
      '12D3KooWExample5',
      '12D3KooWExample6'
    ];

    nodeIds.forEach((nodeId, index) => {
      this.nodeMetrics.set(nodeId, {
        nodeId,
        uptime: 95.5 + Math.random() * 4, // 95.5% - 99.5%
        orderSuccessRate: 88 + Math.random() * 10, // 88% - 98%
        tradingVolume: 1.2 + Math.random() * 8.8, // 1.2 - 10 ETH
        avgResponseTime: 50 + Math.random() * 200, // 50-250ms
        ordersProcessed: 15 + Math.floor(Math.random() * 85), // 15-100 orders
        reputation: 75 + Math.random() * 25, // 75-100 reputation
        lastUpdated: Date.now() - Math.random() * 3600000 // Last hour
      });
    });

    // Seed user reputations (including current user)
    const userIds = [
      '0xfa321eed1c2808506d4389414ddc798c43ce9a5e', // Current user
      '0x742d35Cc6634C0532925a3b8D9899Fe4623fcfd8',
      '0x123456789abcdef123456789abcdef1234567890',
      '0x987654321fedcba987654321fedcba9876543210',
      '0xabcdef123456789abcdef123456789abcdef1234',
      '0x555666777888999aaabbbcccdddeeefff0001111'
    ];

    userIds.forEach((userId, index) => {
      this.userReputations.set(userId, {
        userId,
        reputation: 70 + Math.random() * 30, // 70-100
        ordersCompleted: 5 + Math.floor(Math.random() * 25), // 5-30 orders
        totalVolume: 0.5 + Math.random() * 5, // 0.5-5.5 ETH
        successRate: 85 + Math.random() * 15, // 85-100%
        lastActive: Date.now() - Math.random() * 86400000 // Last 24h
      });
    });
  }

  private startMetricsUpdater() {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateNodeMetrics();
      this.updateUserReputations();
    }, 30000);

    // Process blockchain events every 60 seconds
    setInterval(() => {
      this.processRecentBlocks();
    }, 60000);
  }

  private updateNodeMetrics() {
    this.nodeMetrics.forEach((metrics, nodeId) => {
      // Simulate realistic metric changes
      metrics.uptime = Math.max(90, Math.min(100, metrics.uptime + (Math.random() - 0.5) * 0.5));
      metrics.orderSuccessRate = Math.max(80, Math.min(100, metrics.orderSuccessRate + (Math.random() - 0.5) * 2));
      metrics.avgResponseTime = Math.max(30, Math.min(500, metrics.avgResponseTime + (Math.random() - 0.5) * 20));
      
      // Occasionally process new orders
      if (Math.random() < 0.3) {
        metrics.ordersProcessed += Math.floor(Math.random() * 3) + 1;
        metrics.tradingVolume += Math.random() * 0.5;
      }

      // Recalculate reputation based on metrics
      metrics.reputation = this.calculateNodeReputation(metrics);
      metrics.lastUpdated = Date.now();
    });
  }

  private updateUserReputations() {
    this.userReputations.forEach((userRep, userId) => {
      // Simulate user activity
      if (Math.random() < 0.2) { // 20% chance of activity
        userRep.ordersCompleted += Math.floor(Math.random() * 2) + 1;
        userRep.totalVolume += Math.random() * 0.3;
        userRep.lastActive = Date.now();
        
        // Update success rate based on recent activity
        userRep.successRate = Math.max(75, Math.min(100, userRep.successRate + (Math.random() - 0.4) * 5));
        
        // Recalculate reputation
        userRep.reputation = this.calculateUserReputation(userRep);
      }
    });
  }

  private calculateNodeReputation(metrics: NodeMetrics): number {
    const uptimeWeight = 0.3;
    const successRateWeight = 0.4;
    const responseTimeWeight = 0.2;
    const volumeWeight = 0.1;

    const uptimeScore = metrics.uptime;
    const successScore = metrics.orderSuccessRate;
    const responseScore = Math.max(0, 100 - (metrics.avgResponseTime / 5)); // Penalty for slow response
    const volumeScore = Math.min(100, metrics.tradingVolume * 10); // Up to 100 points for volume

    return Math.round(
      uptimeScore * uptimeWeight +
      successScore * successRateWeight +
      responseScore * responseTimeWeight +
      volumeScore * volumeWeight
    );
  }

  private calculateUserReputation(userRep: UserReputation): number {
    const successRateWeight = 0.5;
    const volumeWeight = 0.3;
    const activityWeight = 0.2;

    const successScore = userRep.successRate;
    const volumeScore = Math.min(100, userRep.totalVolume * 20);
    const activityScore = Math.min(100, userRep.ordersCompleted * 3);

    return Math.round(
      successScore * successRateWeight +
      volumeScore * volumeWeight +
      activityScore * activityWeight
    );
  }

  private async processRecentBlocks() {
    if (!this.provider) return;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      // Process blocks since last check
      for (let block = this.lastBlockProcessed + 1; block <= currentBlock; block++) {
        await this.processBlockForOrderEvents(block);
      }
      
      this.lastBlockProcessed = currentBlock;
    } catch (error) {
      console.error('Error processing recent blocks:', error);
    }
  }

  private async processBlockForOrderEvents(blockNumber: number) {
    // In a real implementation, this would scan for actual order events
    // For now, simulate finding order events
    if (Math.random() < 0.1) { // 10% chance of finding an order event
      console.log(`📊 Oracle: Found simulated order event in block ${blockNumber}`);
      
      // Update metrics for random node and user
      const randomNode = Array.from(this.nodeMetrics.keys())[Math.floor(Math.random() * this.nodeMetrics.size)];
      const randomUser = Array.from(this.userReputations.keys())[Math.floor(Math.random() * this.userReputations.size)];
      
      if (randomNode) {
        const nodeMetrics = this.nodeMetrics.get(randomNode)!;
        nodeMetrics.ordersProcessed += 1;
        nodeMetrics.tradingVolume += Math.random() * 0.1;
      }
      
      if (randomUser) {
        const userRep = this.userReputations.get(randomUser)!;
        userRep.ordersCompleted += 1;
        userRep.totalVolume += Math.random() * 0.1;
        userRep.lastActive = Date.now();
      }
    }
  }

  // Public API methods
  public getTopNodesByReputation(limit = 5): NodeMetrics[] {
    return Array.from(this.nodeMetrics.values())
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, limit);
  }

  public getTopUsersByReputation(limit = 5): UserReputation[] {
    return Array.from(this.userReputations.values())
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, limit);
  }

  public getUserReputation(userId: string): UserReputation | null {
    return this.userReputations.get(userId.toLowerCase()) || null;
  }

  public getNodeMetrics(nodeId: string): NodeMetrics | null {
    return this.nodeMetrics.get(nodeId) || null;
  }

  public updateUserActivity(userId: string, orderFilled = false, volume = 0) {
    const userRep = this.userReputations.get(userId.toLowerCase());
    if (!userRep) return;

    if (orderFilled) {
      userRep.ordersCompleted += 1;
      userRep.totalVolume += volume;
      userRep.successRate = Math.min(100, userRep.successRate + 0.5);
    }
    
    userRep.lastActive = Date.now();
    userRep.reputation = this.calculateUserReputation(userRep);
    
    console.log(`📊 Oracle: Updated user ${userId.slice(0, 8)}... reputation to ${userRep.reputation}`);
  }

  public getLeaderboardData(currentUserId: string) {
    const topUsers = this.getTopUsersByReputation(5);
    const currentUser = this.getUserReputation(currentUserId);
    
    // If current user is not in top 5, add them
    let leaderboard = [...topUsers];
    if (currentUser && !topUsers.some(u => u.userId.toLowerCase() === currentUserId.toLowerCase())) {
      leaderboard.push(currentUser);
    }
    
    return {
      leaderboard,
      topNodes: this.getTopNodesByReputation(5),
      currentUser,
      lastUpdated: Date.now()
    };
  }
}

export const sepoliaOracle = new SepoliaOracle();