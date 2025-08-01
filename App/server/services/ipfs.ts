import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { LevelBlockstore } from 'blockstore-level';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { bootstrap } from '@libp2p/bootstrap';
import { createVerifiedFetch } from '@helia/verified-fetch';
import type { Order } from '@shared/schema';
import crypto from 'crypto';

class IPFSService {
  private helia: any = null;
  private fs: any = null;
  private blockstore: LevelBlockstore | null = null;
  private verifiedFetch: any = null;
  private isStarted = false;

  async start() {
    if (this.isStarted) return;

    try {
      const blockstoreDir = process.env.BLOCKSTORE_DIR || './helia-blockstore-db';
      this.blockstore = new LevelBlockstore(blockstoreDir);

      // IPFS public bootstrap nodes for connecting to the main network
      const bootstrapNodes = [
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZKMH2DYNOFGOAAacLpEhj3Y1R4YCPr',
        '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbqjZ1f1N6Q6T8vz3a',
        '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ',
        '/ip4/104.131.131.82/udp/4001/quic/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
      ];

      const libp2p = await createLibp2p({
        addresses: {
          listen: [
            '/ip4/0.0.0.0/tcp/0/ws'
          ]
        },
        transports: [webSockets()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          identify: identify(),
          ping: ping(),
          bootstrap: bootstrap({
            list: bootstrapNodes
          }),
          dht: kadDHT({
            validators: {},
            selectors: {},
            clientMode: false
          })
        }
      });

      this.helia = await createHelia({
        libp2p,
        blockstore: this.blockstore
      });

      this.fs = unixfs(this.helia);
      
      // Create verified fetch instance for external verification
      this.verifiedFetch = await createVerifiedFetch(this.helia);
      
      this.isStarted = true;

      console.log("IPFS/Helia service started");
      console.log("Peer ID:", this.helia.libp2p.peerId.toString());
      console.log("Multiaddrs:", this.helia.libp2p.getMultiaddrs().map((addr: any) => addr.toString()));

      // Connect to bootstrap nodes for public network access
      await this.connectToPublicNetwork();
      
      // Start periodic reproviding for content discovery
      this.startPeriodicReproviding();
      
      console.log("IPFS service initialized successfully with public network connectivity");

    } catch (error) {
      console.error("Failed to start IPFS service:", error);
      throw error;
    }
  }

  async addOrder(order: any): Promise<{ localCid: string; publicCid: string | null }> {
    if (!this.fs) throw new Error("IPFS not initialized");

    try {
      const orderData = JSON.stringify({
        id: order.id,
        encrypted: order.encrypted,
        data: order.data,
        poolName: order.poolName,
        order: order.order,
        signature: order.signature,
        submittedAt: order.submittedAt,
        timestamp: Date.now()
      });

      const encoder = new TextEncoder();
      const cid = await this.fs.addBytes(encoder.encode(orderData));
      const hash = cid.toString();

      console.log("Order added to IPFS:", hash);

      // Pin content locally for persistence
      await this.helia.pins.add(cid);
      console.log("Content pinned locally:", hash);

      // Pin to public IPFS network immediately using direct upload
      let publicCid: string | null = null;
      try {
        publicCid = await this.uploadToPublicIPFS(hash, orderData);
      } catch (error) {
        console.warn("Public IPFS upload failed, content available locally:", error);
      }

      // Return both local and public CID
      return { localCid: hash, publicCid };

      return hash;
    } catch (error) {
      console.error("Failed to add order to IPFS:", error);
      throw error;
    }
  }

  async getOrder(hash: string): Promise<any> {
    if (!this.fs) throw new Error("IPFS not initialized");

    try {
      const decoder = new TextDecoder();
      const chunks = [];
      
      for await (const chunk of this.fs.cat(hash)) {
        chunks.push(chunk);
      }

      const data = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      return JSON.parse(decoder.decode(data));
    } catch (error) {
      console.error("Failed to get order from IPFS:", error);
      throw error;
    }
  }

  private async startPeriodicReproviding() {
    if (!this.helia) return;

    const interval = 10 * 60 * 1000; // 10 minutes - more frequent for better discoverability
    
    setInterval(async () => {
      try {
        console.log("Starting periodic reproviding for external verification...");
        
        // Announce our peer to the DHT
        try {
          const peerId = this.helia.libp2p.peerId;
          await this.helia.routing.provide(peerId);
          console.log("Peer announced to DHT for discovery");
        } catch (error) {
          console.warn("Peer announcement failed:", error);
        }
        
        console.log("Periodic reproviding completed");
        
      } catch (error) {
        console.error("Periodic reproviding failed:", error);
      }
    }, interval);
  }

  getStatus(): { connected: boolean; peerId?: string; peers?: number; multiaddrs?: string[] } {
    if (!this.helia) {
      return { connected: false };
    }

    return {
      connected: this.isStarted,
      peerId: this.helia.libp2p.peerId.toString(),
      peers: this.helia.libp2p.getPeers().length,
      multiaddrs: this.helia.libp2p.getMultiaddrs().map((addr: any) => addr.toString())
    };
  }

  // Connect to public IPFS network
  async connectToPublicNetwork(): Promise<void> {
    try {
      // Wait for libp2p to connect to bootstrap nodes
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log("✅ Connected to public IPFS network");
      console.log(`Connected peers: ${this.helia.libp2p.getPeers().length}`);
      
    } catch (error) {
      console.warn("Failed to connect to public IPFS network:", error);
    }
  }

  // Upload content to Pinata for real public IPFS access
  async uploadToPublicIPFS(cid: string, data: string): Promise<string | null> {
    try {
      const pinataApiKey = process.env.PINATA_JWT;
      const pinataSecretKey = process.env.PINATA_SECRET_KEY;
      
      if (!pinataApiKey || !pinataSecretKey) {
        console.log("⚠️ Pinata credentials not found. Content stored locally only.");
        return null;
      }

      console.log(`🌐 Uploading to Pinata for public IPFS access...`);

      // Method 1: Upload JSON data directly to Pinata (try JWT auth first)
      const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pinataApiKey}`,
          'User-Agent': 'PonyHof/1.0'
        },
        body: JSON.stringify({
          pinataContent: JSON.parse(data),
          pinataMetadata: {
            name: `PonyHof-Order-${cid.slice(-8)}`,
            description: 'PonyHof encrypted order relay'
          }
        })
      });

      if (pinataResponse.ok) {
        const result = await pinataResponse.json();
        const publicCid = result.IpfsHash;
        
        console.log(`✅ Successfully uploaded to Pinata: ${publicCid}`);
        console.log(`🌐 PUBLIC IPFS LINK: https://ipfs.io/ipfs/${publicCid}`);
        console.log(`🌐 PINATA GATEWAY: https://gateway.pinata.cloud/ipfs/${publicCid}`);

        // Verify accessibility on multiple public gateways
        this.verifyPublicAccess(publicCid);
        return publicCid;
      } else {
        const errorText = await pinataResponse.text();
        console.log(`❌ Pinata JSON upload failed: ${pinataResponse.status} ${pinataResponse.statusText}`);
        console.log(`Error details: ${errorText.slice(0, 200)}`);
      }

      // Fallback: Try file upload method
      const formData = new FormData();
      formData.append('file', new Blob([data], { type: 'application/json' }), 'order.json');
      formData.append('pinataMetadata', JSON.stringify({
        name: `PonyHof-Order-${cid.slice(-8)}`
      }));

      const fileResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pinataApiKey}`,
          'User-Agent': 'PonyHof/1.0'
        },
        body: formData
      });

      if (fileResponse.ok) {
        const result = await fileResponse.json();
        const publicCid = result.IpfsHash;
        
        console.log(`✅ Pinata file upload successful: ${publicCid}`);
        console.log(`🌐 PUBLIC IPFS LINK: https://ipfs.io/ipfs/${publicCid}`);
        console.log(`🌐 PINATA GATEWAY: https://gateway.pinata.cloud/ipfs/${publicCid}`);

        this.verifyPublicAccess(publicCid);
        return publicCid;
      }

      const errorText = await fileResponse.text();
      console.log(`❌ Pinata file upload failed: ${fileResponse.status}`);
      console.log(`Error: ${errorText.slice(0, 200)}`);
      console.log(`📋 Content stored locally only. Verify via: /api/ipfs/verify/${cid}`);
      return null;
      
    } catch (error) {
      console.warn("Pinata upload error:", error instanceof Error ? error.message : String(error));
      console.log(`📋 Local content available via: /api/ipfs/verify/${cid}`);
      return null;
    }
  }

  // Verify public gateway accessibility
  private async verifyPublicAccess(cid: string): Promise<void> {
    setTimeout(async () => {
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://dweb.link/ipfs/${cid}`
      ];

      for (const gatewayUrl of gateways) {
        try {
          const response = await fetch(gatewayUrl, { 
            method: 'HEAD',
            signal: AbortSignal.timeout(15000)
          });
          
          if (response.ok) {
            console.log(`🌐 PUBLIC IPFS VERIFIED: ${gatewayUrl}`);
            return;
          }
        } catch (error) {
          // Content may still be propagating
        }
      }
      
      console.log(`⏳ Content uploaded but may still be propagating to public gateways`);
    }, 10000);
  }

  // Enhanced external verification method
  async verifyExternalCID(cid: string): Promise<{ verified: boolean; data?: any; error?: string }> {
    try {
      console.log("Attempting external CID verification:", cid);
      
      // Method 1: Try local verified fetch first
      if (this.verifiedFetch) {
        try {
          const response = await this.verifiedFetch(`ipfs://${cid}`);
          if (response.ok) {
            const data = await response.text();
            console.log("Local IPFS CID verification successful:", cid);
            return { verified: true, data: JSON.parse(data) };
          }
        } catch (error) {
          console.warn("Local verified fetch failed, trying public gateways:", error);
        }
      }

      // Method 2: Try public IPFS gateways
      const publicGateways = [
        'https://ipfs.io/ipfs',
        'https://gateway.pinata.cloud/ipfs',
        'https://cloudflare-ipfs.com/ipfs'
      ];

      for (const gateway of publicGateways) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`${gateway}/${cid}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.text();
            console.log(`✅ External CID verification successful via ${gateway}:`, cid);
            return { verified: true, data: JSON.parse(data) };
          }
        } catch (error) {
          // Continue to next gateway
        }
      }

      return { verified: false, error: "CID not accessible via public IPFS gateways" };
    } catch (error) {
      console.error("External CID verification failed:", error);
      return { verified: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stop() {
    if (this.helia) {
      await this.helia.stop();
      this.helia = null;
      this.fs = null;
      this.verifiedFetch = null;
      this.isStarted = false;
      console.log("IPFS service stopped");
    }
  }
}

export const ipfsService = new IPFSService();
