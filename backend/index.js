import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { createHelia } from 'helia';
import { CID } from 'multiformats/cid';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { mdns } from '@libp2p/mdns';
import { LevelBlockstore } from 'blockstore-level'; // Persistent blockstore backend

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// AES-256-CTR Encryption helper
function encryptOrder(order, secret) {
  const cipher = crypto.createCipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0) // IV of 16 zero bytes
  );
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]);
  return encrypted.toString('hex');
}

// AES-256-CTR Decryption helper
function decryptOrder(encryptedHex, secret) {
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0)
  );
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString());
}

let heliaNode;
let libp2pNode;
let ipfsOrdersCID = null;
let ordersCache = [];

// Promise indicating readiness of pubsub subscription
let pubsubSubscribed = null;

async function startHeliaNode() {
  // Explicitly create LevelBlockstore for persistent storage to avoid IdentityBlockstore errors
  const blockstore = new LevelBlockstore('./helia-blockstore-db');
  heliaNode = await createHelia({ blockstore });

  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
    },
    peerDiscovery: [mdns({ interval: 10000 })],
    connectionManager: {
      autoDial: true,
      maxConnections: 100,
    },
  });

  await libp2pNode.start();

  libp2pNode.addEventListener('peer:discovery', evt => {
    console.log('Discovered peer:', evt.detail.id.toString());
  });

  libp2pNode.addEventListener('peer:connect', evt => {
    console.log('Connected to peer:', evt.detail.remotePeer.toString());
  });

  libp2pNode.addEventListener('peer:disconnect', evt => {
    console.log('Disconnected from peer:', evt.detail.remotePeer.toString());
  });

  console.log('Libp2p started with peerId:', libp2pNode.peerId.toString());
  console.log('Helia blockstore instance:', heliaNode.blockstore.constructor.name); // Should print LevelBlockstore or BlockStorage

  // Track known orders to avoid duplicates
  const knownOrderHashes = new Set();

  pubsubSubscribed = new Promise((resolve) => {
    libp2pNode.services.pubsub.subscribe('orders', (msg) => {
      try {
        const dataStr = msg.data.toString();
        let received;

        if (process.env.ENCRYPTION_KEY) {
          try {
            received = decryptOrder(dataStr, process.env.ENCRYPTION_KEY);
          } catch {
            received = JSON.parse(dataStr);
          }
        } else {
          received = JSON.parse(dataStr);
        }

        if (!received.order && !received.encrypted && !received.data) return;

        const orderHash = JSON.stringify(received);
        if (knownOrderHashes.has(orderHash)) return;

        knownOrderHashes.add(orderHash);
        ordersCache.push(received);

        libp2pNode.services.pubsub.publish('orders', Buffer.from(JSON.stringify(received))).catch((err) => {
          if (err.message === 'PublishError.NoPeersSubscribedToTopic') {
            console.warn('Publish warning:', err.message);
          } else {
            console.error('Publish error:', err);
          }
        });
      } catch (err) {
        console.error('PubSub message handler error:', err);
      }
    });

    console.log('Subscribed to pubsub topic: orders');
    resolve();
  });

  console.log('Helia and libp2p nodes started successfully');
}

// Sync orders to IPFS, update CID and cache
async function syncOrdersToIPFS(orders) {
  try {
    console.log('Syncing orders to IPFS:', orders);
    if (!heliaNode || !heliaNode.blockstore) throw new Error('Helia or blockstore not initialized');

    const encoded = new TextEncoder().encode(JSON.stringify(orders));
    const cid = await heliaNode.blockstore.put(encoded);
    ipfsOrdersCID = cid.toString();
    ordersCache = orders;
    console.log('New IPFS CID:', ipfsOrdersCID);
    return ipfsOrdersCID;
  } catch (err) {
    console.error('Error in syncOrdersToIPFS:', err);
    throw err;
  }
}

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json([]);

  try {
    const cid = CID.parse(ipfsOrdersCID);
    const bytes = await heliaNode.blockstore.get(cid);
    const data = new TextDecoder().decode(bytes);
    return res.json(JSON.parse(data));
  } catch (err) {
    console.warn('IPFS fetch failed, returning cached orders:', err);
    return res.json(ordersCache);
  }
});

app.post('/api/orders', async (req, res) => {
  console.log('POST /api/orders body:', req.body);

  try {
    if (!req.body) return res.status(400).json({ error: 'Empty request body' });

    const { orders, order, signature, metadata, encrypted = false, encryptKey = '' } = req.body;

    if (!orders && !order) {
      return res.status(400).json({ error: 'Missing orders and order payload' });
    }

    let newOrders = Array.isArray(orders) && orders.length ? [...orders] : [...ordersCache];

    if (order && signature) {
      const storedOrder = encrypted
        ? {
            encrypted: true,
            data: encryptOrder({ order, signature, metadata }, encryptKey || process.env.ENCRYPTION_KEY),
          }
        : { order, signature, metadata };

      newOrders.push(storedOrder);

      if (libp2pNode && libp2pNode.services.pubsub) {
        try {
          await pubsubSubscribed;
          const payload = encrypted ? storedOrder.data : JSON.stringify(storedOrder);
          await libp2pNode.services.pubsub.publish('orders', Buffer.from(payload));
          console.log('Published new order to pubsub');
        } catch (pubsubErr) {
          console.warn('Pubsub publish failed:', pubsubErr.message || pubsubErr);
          // Continue regardless
        }
      }
    }

    const newCID = await syncOrdersToIPFS(newOrders);
    return res.json({ success: true, ipfsCID: newCID });
  } catch (err) {
    console.error('Failed to sync orders with IPFS:', err);
    return res.status(500).json({ error: 'Failed to sync orders with IPFS' });
  }
});

app.post('/api/gasless-fill', async (req, res) => {
  try {
    const relayerUrl = process.env.RELAYER_API_URL || 'http://localhost:3001';

    const response = await fetch(`${relayerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Relayer error: ${errText}`);
    }

    const json = await response.json();
    return res.json({ success: true, transactionHash: json.hash });
  } catch (err) {
    console.error('Gasless fill relayer error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, async () => {
  try {
    // Optionally clear database for a clean state on startup:
    // import { rmSync } from 'fs';
    // rmSync('./helia-blockstore-db', { recursive: true, force: true });

    await startHeliaNode();
    console.log(`🚀 RainbowRelay backend running at http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to start backend nodes:', err);
    process.exit(1);
  }
});
