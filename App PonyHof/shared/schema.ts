import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  reputationScore: decimal("reputation_score", { precision: 5, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  successfulOrders: integer("successful_orders").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fromToken: text("from_token").notNull(),
  toToken: text("to_token").notNull(),
  amount: decimal("amount", { precision: 36, scale: 18 }).notNull(),
  rate: decimal("rate", { precision: 36, scale: 18 }).notNull(),
  pool: text("pool").notNull(), // "whales" or "institutions"
  status: text("status").notNull().default("pending"), // pending, matched, filled, cancelled
  encryptedData: text("encrypted_data").notNull(),
  ipfsHash: text("ipfs_hash"),
  signature: text("signature").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  filledAt: timestamp("filled_at"),
  txHash: text("tx_hash"),
});

export const relayNodes = pgTable("relay_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  peerId: text("peer_id").notNull().unique(),
  address: text("address").notNull(),
  reputationScore: decimal("reputation_score", { precision: 5, scale: 2 }).default("0"),
  uptime: decimal("uptime", { precision: 5, scale: 2 }).default("0"),
  ordersProcessed: integer("orders_processed").default(0),
  averageResponseTime: integer("average_response_time").default(0), // in milliseconds
  isActive: boolean("is_active").default(true),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const networkActivity = pgTable("network_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // order_filled, node_joined, order_propagated, gasless_fill
  description: text("description").notNull(),
  pool: text("pool"),
  orderId: varchar("order_id").references(() => orders.id),
  nodeId: varchar("node_id").references(() => relayNodes.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  walletAddress: true,
});

export const insertOrderSchema = createInsertSchema(orders).pick({
  fromToken: true,
  toToken: true,
  amount: true,
  rate: true,
  pool: true,
  encryptedData: true,
  signature: true,
});

export const insertRelayNodeSchema = createInsertSchema(relayNodes).pick({
  peerId: true,
  address: true,
});

export const insertActivitySchema = createInsertSchema(networkActivity).pick({
  type: true,
  description: true,
  pool: true,
  orderId: true,
  nodeId: true,
  metadata: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertRelayNode = z.infer<typeof insertRelayNodeSchema>;
export type RelayNode = typeof relayNodes.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type NetworkActivity = typeof networkActivity.$inferSelect;
