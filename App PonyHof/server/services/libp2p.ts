import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { ping } from '@libp2p/ping';
import type { Order } from '@shared/schema';
import { storage } from '../storage';
import { encryptionService } from './encryption';

class LibP2PService {
  private node: any = null;
  private isStarted = false;

  async start() {
    if (this.isStarted) return;

    try {
      this.node = await createLibp2p({
        addresses: {
          listen: ['/ip4/0.0.0.0/tcp/0/ws']
        },
        transports: [webSockets()],
        connectionEncryption: [noise()],
        streamMuxers: [yamux()],
        services: {
          pubsub: gossipsub({
            allowPublishToZeroPeers: true,
            msgIdFn: (msg) => {
              const hash = new TextEncoder().encode(msg.data.toString());
              return hash.slice(0, 8);
            },
            fastMsgIdFn: (msg) => {
              return new TextEncoder().encode(msg.data.toString()).slice(0, 8);
            }
          }),
          identify: identify(),
          ping: ping(),
          dht: kadDHT()
        }
      });

      await this.node.start();
      this.isStarted = true;

      console.log("LibP2P service started");
      console.log("Peer ID:", this.node.peerId.toString());

      // Subscribe to pool topics
      await this.subscribeToPoolTopics();

      // Create relay node entry
      await storage.createRelayNode({
        peerId: this.node.peerId.toString(),
        address: this.node.getMultiaddrs()[0]?.toString() || "unknown"
      });

      // Log activity
      await storage.createActivity({
        type: "node_joined",
        description: "New relay node joined the network",
        metadata: { 
          peerId: this.node.peerId.toString(),
          reputationScore: 95.0
        }
      });

    } catch (error) {
      console.error("Failed to start LibP2P service:", error);
      throw error;
    }
  }

  private async subscribeToPoolTopics() {
    if (!this.node) return;

    const topics = ['ponyhof-whales', 'ponyhof-institutions', 'ponyhof-network'];

    for (const topic of topics) {
      await this.node.services.pubsub.subscribe(topic);
      
      this.node.services.pubsub.addEventListener('message', async (evt) => {
        if (evt.detail.topic === topic) {
          await this.handlePoolMessage(evt.detail, topic);
        }
      });
    }

    console.log("Subscribed to pool topics:", topics);
  }

  private async handlePoolMessage(message: any, topic: string) {
    try {
      const data = JSON.parse(new TextDecoder().decode(message.data));
      
      if (data.type === 'encrypted_order') {
        console.log(`Received encrypted order on ${topic}:`, data.orderId);
        
        // Decrypt and process order
        const pool = topic.replace('ponyhof-', '');
        const decryptedOrder = encryptionService.decryptOrder(data.encryptedData, pool);
        
        if (decryptedOrder) {
          // Update order status to indicate propagation
          await storage.createActivity({
            type: "order_propagated",
            description: `Encrypted order propagated to ${this.getPeerCount()} peers`,
            pool,
            orderId: data.orderId,
            metadata: { 
              peers: this.getPeerCount(),
              topic
            }
          });
        }
      }
    } catch (error) {
      console.error("Failed to handle pool message:", error);
    }
  }

  async broadcastOrder(order: Order, pool: string) {
    if (!this.node) throw new Error("LibP2P not initialized");

    try {
      const topic = `ponyhof-${pool}`;
      const message = {
        type: 'encrypted_order',
        orderId: order.id,
        encryptedData: order.encryptedData,
        signature: order.signature,
        timestamp: Date.now()
      };

      const encoder = new TextEncoder();
      await this.node.services.pubsub.publish(topic, encoder.encode(JSON.stringify(message)));

      console.log(`Order broadcasted to ${topic}:`, order.id);

      // Log propagation activity
      await storage.createActivity({
        type: "order_propagated",
        description: `Encrypted order propagated to ${this.getPeerCount()} peers`,
        pool,
        orderId: order.id,
        metadata: { 
          peers: this.getPeerCount(),
          topic
        }
      });

    } catch (error) {
      console.error("Failed to broadcast order:", error);
      throw error;
    }
  }

  getPeerCount(): number {
    return this.node ? this.node.getPeers().length : 0;
  }

  getPeers(): string[] {
    return this.node ? this.node.getPeers().map(peer => peer.toString()) : [];
  }

  async stop() {
    if (this.node) {
      await this.node.stop();
      this.node = null;
      this.isStarted = false;
      console.log("LibP2P service stopped");
    }
  }
}

export const libp2pService = new LibP2PService();
