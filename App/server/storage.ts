import { 
  type User, 
  type InsertUser, 
  type Order, 
  type InsertOrder,
  type RelayNode, 
  type InsertRelayNode,
  type NetworkActivity,
  type InsertActivity 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserReputation(id: string, score: number): Promise<void>;

  // Order operations
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByUser(userId: string): Promise<Order[]>;
  getActiveOrders(): Promise<Order[]>;
  getOrdersByPool(pool: string): Promise<Order[]>;
  createOrder(order: InsertOrder & { userId: string }): Promise<Order>;
  updateOrderStatus(id: string, status: string, txHash?: string): Promise<void>;
  updateOrderIpfsHash(id: string, ipfsHash: string): Promise<void>;

  // Relay node operations
  getRelayNode(id: string): Promise<RelayNode | undefined>;
  getRelayNodeByPeerId(peerId: string): Promise<RelayNode | undefined>;
  getActiveRelayNodes(): Promise<RelayNode[]>;
  createRelayNode(node: InsertRelayNode): Promise<RelayNode>;
  updateRelayNodeStatus(peerId: string, isActive: boolean): Promise<void>;
  updateRelayNodeStats(peerId: string, stats: { 
    ordersProcessed?: number; 
    averageResponseTime?: number; 
    uptime?: number; 
  }): Promise<void>;

  // Network activity operations
  getRecentActivity(limit?: number): Promise<NetworkActivity[]>;
  createActivity(activity: InsertActivity): Promise<NetworkActivity>;

  // Stats operations
  getUserStats(userId: string): Promise<{
    activeOrders: number;
    totalVolume: string;
    gasSaved: string;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private orders: Map<string, Order>;
  private relayNodes: Map<string, RelayNode>;
  private activities: NetworkActivity[];

  constructor() {
    this.users = new Map();
    this.orders = new Map();
    this.relayNodes = new Map();
    this.activities = [];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id, 
      reputationScore: "0",
      totalOrders: 0,
      successfulOrders: 0,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserReputation(id: string, score: number): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.reputationScore = score.toString();
      this.users.set(id, user);
    }
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(order => order.userId === userId);
  }

  async getActiveOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(order => 
      order.status === "pending" || order.status === "matched"
    );
  }

  async getOrdersByPool(pool: string): Promise<Order[]> {
    return Array.from(this.orders.values()).filter(order => order.pool === pool);
  }

  async createOrder(orderData: InsertOrder & { userId: string }): Promise<Order> {
    const id = randomUUID();
    const order: Order = {
      ...orderData,
      id,
      status: "pending",
      createdAt: new Date(),
      filledAt: null,
      txHash: null,
      ipfsHash: null
    };
    this.orders.set(id, order);
    return order;
  }

  async updateOrderStatus(id: string, status: string, txHash?: string): Promise<void> {
    const order = this.orders.get(id);
    if (order) {
      order.status = status;
      if (txHash) order.txHash = txHash;
      if (status === "filled") order.filledAt = new Date();
      this.orders.set(id, order);
    }
  }

  async updateOrderIpfsHash(id: string, ipfsHash: string): Promise<void> {
    const order = this.orders.get(id);
    if (order) {
      order.ipfsHash = ipfsHash;
      this.orders.set(id, order);
    }
  }

  async getRelayNode(id: string): Promise<RelayNode | undefined> {
    return this.relayNodes.get(id);
  }

  async getRelayNodeByPeerId(peerId: string): Promise<RelayNode | undefined> {
    return Array.from(this.relayNodes.values()).find(node => node.peerId === peerId);
  }

  async getActiveRelayNodes(): Promise<RelayNode[]> {
    return Array.from(this.relayNodes.values()).filter(node => node.isActive);
  }

  async createRelayNode(insertNode: InsertRelayNode): Promise<RelayNode> {
    const id = randomUUID();
    const node: RelayNode = {
      ...insertNode,
      id,
      reputationScore: "0",
      uptime: "0",
      ordersProcessed: 0,
      averageResponseTime: 0,
      isActive: true,
      lastSeen: new Date(),
      createdAt: new Date()
    };
    this.relayNodes.set(id, node);
    return node;
  }

  async updateRelayNodeStatus(peerId: string, isActive: boolean): Promise<void> {
    const node = Array.from(this.relayNodes.values()).find(n => n.peerId === peerId);
    if (node) {
      node.isActive = isActive;
      node.lastSeen = new Date();
      this.relayNodes.set(node.id, node);
    }
  }

  async updateRelayNodeStats(peerId: string, stats: {
    ordersProcessed?: number;
    averageResponseTime?: number;
    uptime?: number;
  }): Promise<void> {
    const node = Array.from(this.relayNodes.values()).find(n => n.peerId === peerId);
    if (node) {
      if (stats.ordersProcessed !== undefined) node.ordersProcessed = stats.ordersProcessed;
      if (stats.averageResponseTime !== undefined) node.averageResponseTime = stats.averageResponseTime;
      if (stats.uptime !== undefined) node.uptime = stats.uptime.toString();
      this.relayNodes.set(node.id, node);
    }
  }

  async getRecentActivity(limit = 10): Promise<NetworkActivity[]> {
    return this.activities
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async createActivity(insertActivity: InsertActivity): Promise<NetworkActivity> {
    const id = randomUUID();
    const activity: NetworkActivity = {
      ...insertActivity,
      id,
      createdAt: new Date()
    };
    this.activities.push(activity);
    return activity;
  }

  async getUserStats(userId: string): Promise<{
    activeOrders: number;
    totalVolume: string;
    gasSaved: string;
  }> {
    const userOrders = await this.getOrdersByUser(userId);
    const activeOrders = userOrders.filter(o => o.status === "pending" || o.status === "matched").length;
    
    // Calculate total volume (simplified)
    const totalVolume = userOrders
      .filter(o => o.status === "filled")
      .reduce((sum, order) => sum + parseFloat(order.amount), 0);

    // Estimate gas saved (simplified)
    const gasSaved = userOrders.filter(o => o.status === "filled").length * 0.045;

    return {
      activeOrders,
      totalVolume: `$${(totalVolume * 2450).toLocaleString()}`, // Assuming ETH price
      gasSaved: `${gasSaved.toFixed(3)} ETH`
    };
  }
}

export const storage = new MemStorage();
