import { storage } from '../storage';
import type { RelayNode, User } from '@shared/schema';

class ReputationService {
  async calculateUserReputation(userId: string): Promise<number> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return 0;

      const userOrders = await storage.getOrdersByUser(userId);
      const totalOrders = userOrders.length;
      const successfulOrders = userOrders.filter(order => order.status === 'filled').length;
      const cancelledOrders = userOrders.filter(order => order.status === 'cancelled').length;

      if (totalOrders === 0) return 50; // Starting reputation

      // Base calculation
      const successRate = successfulOrders / totalOrders;
      const cancellationPenalty = (cancelledOrders / totalOrders) * 20;
      
      // Volume bonus (simplified)
      const volumeBonus = Math.min(totalOrders * 0.5, 20);
      
      // Calculate final score
      let reputation = (successRate * 80) + volumeBonus - cancellationPenalty;
      reputation = Math.max(0, Math.min(100, reputation)); // Clamp between 0-100

      await storage.updateUserReputation(userId, reputation);
      return reputation;
    } catch (error) {
      console.error("Failed to calculate user reputation:", error);
      return 0;
    }
  }

  async calculateNodeReputation(peerId: string): Promise<number> {
    try {
      const node = await storage.getRelayNodeByPeerId(peerId);
      if (!node) return 0;

      // Base metrics
      const uptime = parseFloat(node.uptime);
      const responseTime = node.averageResponseTime;
      const ordersProcessed = node.ordersProcessed;

      // Calculate reputation components
      const uptimeScore = Math.min(uptime, 100); // Max 100 points for uptime
      const responseScore = Math.max(0, 50 - (responseTime / 10)); // Penalty for slow response
      const volumeScore = Math.min(ordersProcessed * 0.1, 30); // Bonus for processing orders

      // Calculate final score
      const reputation = (uptimeScore * 0.5) + (responseScore * 0.3) + (volumeScore * 0.2);
      const finalScore = Math.max(0, Math.min(100, reputation));

      // Update node reputation
      await storage.updateRelayNodeStats(peerId, { 
        uptime,
        averageResponseTime: responseTime,
        ordersProcessed
      });

      return finalScore;
    } catch (error) {
      console.error("Failed to calculate node reputation:", error);
      return 0;
    }
  }

  async updateNodeMetrics(peerId: string, metrics: {
    responseTime?: number;
    orderProcessed?: boolean;
    isOnline?: boolean;
  }) {
    try {
      const node = await storage.getRelayNodeByPeerId(peerId);
      if (!node) return;

      const updates: any = {};

      if (metrics.responseTime !== undefined) {
        // Calculate moving average
        const currentAvg = node.averageResponseTime;
        const newAvg = (currentAvg + metrics.responseTime) / 2;
        updates.averageResponseTime = Math.round(newAvg);
      }

      if (metrics.orderProcessed) {
        updates.ordersProcessed = node.ordersProcessed + 1;
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateRelayNodeStats(peerId, updates);
      }

      if (metrics.isOnline !== undefined) {
        await storage.updateRelayNodeStatus(peerId, metrics.isOnline);
      }

      // Recalculate reputation
      await this.calculateNodeReputation(peerId);
    } catch (error) {
      console.error("Failed to update node metrics:", error);
    }
  }

  async getTopNodes(limit = 10): Promise<RelayNode[]> {
    try {
      const nodes = await storage.getActiveRelayNodes();
      return nodes
        .sort((a, b) => parseFloat(b.reputationScore) - parseFloat(a.reputationScore))
        .slice(0, limit);
    } catch (error) {
      console.error("Failed to get top nodes:", error);
      return [];
    }
  }

  async penalizeNode(peerId: string, reason: string, penalty = 5) {
    try {
      const node = await storage.getRelayNodeByPeerId(peerId);
      if (!node) return;

      const currentScore = parseFloat(node.reputationScore);
      const newScore = Math.max(0, currentScore - penalty);

      await storage.updateRelayNodeStats(peerId, {});
      
      console.log(`Node ${peerId} penalized: ${reason} (-${penalty} points)`);

      await storage.createActivity({
        type: "node_penalized",
        description: `Node penalized: ${reason}`,
        nodeId: node.id,
        metadata: { penalty, reason, newScore }
      });
    } catch (error) {
      console.error("Failed to penalize node:", error);
    }
  }

  async rewardNode(peerId: string, reason: string, reward = 2) {
    try {
      const node = await storage.getRelayNodeByPeerId(peerId);
      if (!node) return;

      const currentScore = parseFloat(node.reputationScore);
      const newScore = Math.min(100, currentScore + reward);

      await storage.updateRelayNodeStats(peerId, {});
      
      console.log(`Node ${peerId} rewarded: ${reason} (+${reward} points)`);

      await storage.createActivity({
        type: "node_rewarded",
        description: `Node rewarded: ${reason}`,
        nodeId: node.id,
        metadata: { reward, reason, newScore }
      });
    } catch (error) {
      console.error("Failed to reward node:", error);
    }
  }
}

export const reputationService = new ReputationService();
