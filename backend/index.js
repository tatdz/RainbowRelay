import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { createLibp2p } from 'libp2p';
import { LevelBlockstore } from 'blockstore-level';
import { CID } from 'multiformats/cid';
import { createHelia } from 'helia';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';
import { encode, decode } from 'multiformats/block';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { mdns } from '@libp2p/mdns';
import { ping } from '@libp2p/ping';
import { kadDHT } from '@libp2p/kad-dht';
import { multiaddr } from '@multiformats/multiaddr';
// Import the createBitswap function from @helia/bitswap
import { createBitswap } from '@helia/bitswap';

// Define a simple logger that can be used with Bitswap
const logger = {
  forComponent: () => ({
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }),
};

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

app.use(cors());
app.use(express.json());

let heliaNode, libp2pNode, bitswap, ipfsOrdersCID = null, ordersCache = [];

// Encryption helper functions
function encryptOrder(order, secret) {
  const cipher = crypto.createCipheriv(
    'aes-256-ctr',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(16, 0)
  );
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]);
  return encrypted.toString('hex');
}

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

// Connect to peer helper
async function connectToPeer(multiaddrStr) {
  try {
    const maddr = multiaddr(multiaddrStr);
    const peerIdStr = multiaddrStr.split('/p2p/')[1];
    await libp2pNode.peerStore.addresses.add(peerIdStr, [maddr]);

    console.log(`Dialing peer at: ${multiaddrStr}`);
    await libp2pNode.dial(peerIdStr);

    console.log(`✅ Successfully dialed peer: ${multiaddrStr}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to dial peer:', err);
    return false;
  }
}

// Start nodes
async function startNode() {
  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub(),
      mdns: mdns({ interval: 10000 }),
      dht: kadDHT(),
    },
  });

  await libp2pNode.start();
  console.log('✅ Libp2p started with peerId:', libp2pNode.peerId.toString());

  const blockstore = new LevelBlockstore('./helia-blockstore-db');

  // Use the logger and components when creating Bitswap
  bitswap = await createBitswap({
    libp2p: libp2pNode,
    blockstore,
    logger,
  });

  heliaNode = await createHelia({
    libp2p: libp2pNode,
    blockstore,
    bitswap
  });

  console.log('✅ Helia node started');

  await libp2pNode.services.pubsub.subscribe('orders');
  console.log('✅ Subscribed to "orders" topic');

  libp2pNode.services.pubsub.addEventListener('message', async (evt) => {
    try {
      const dataStr = new TextDecoder().decode(evt.detail.data);
      let order;

      if (ENCRYPTION_KEY) {
        try {
          order = decryptOrder(dataStr, ENCRYPTION_KEY);
        } catch {
          order = JSON.parse(dataStr);
        }
      } else {
        order = JSON.parse(dataStr);
      }

      const hash = JSON.stringify(order);
      if (!ordersCache.includes(hash)) {
        ordersCache.push(order);
        console.log('📦 Received order:', order);
      }

      try {
        await libp2pNode.services.pubsub.publish('orders', Buffer.from(JSON.stringify(order)));
      } catch (err) {
        if (err.message.includes('NoPeersSubscribedToTopic')) {
          console.warn('⚠️ No peers subscribed to topic.');
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error('PubSub error:', err);
    }
  });
}

// Sync orders to IPFS
async function syncOrdersToIPFS(orders) {
  const encoded = new TextEncoder().encode(JSON.stringify(orders));
  const block = await encode({ value: encoded, codec: raw, hasher: sha256 });

  await heliaNode.blockstore.put(block.cid, block.bytes);
  ipfsOrdersCID = block.cid.toString();
  ordersCache = orders;

  try {
    if (heliaNode.contentRouting?.provide) {
      await heliaNode.contentRouting.provide(block.cid);
      console.log('📡 CID provided to network:', block.cid.toString());
    } else {
      console.warn('⚠️ Content routing not available');
    }
  } catch (err) {
    console.warn('CID provide error:', err);
  }

  return ipfsOrdersCID;
}

// API routes
app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json([]);

  try {
    const cid = CID.parse(ipfsOrdersCID);
    const bytes = await heliaNode.blockstore.get(cid);
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 });
    res.json(JSON.parse(new TextDecoder().decode(block.value)));
  } catch (err) {
    console.warn('IPFS read fallback to cache:', err);
    res.json(ordersCache);
  }
});

app.post('/api/orders', async (req, res) => {
  const { orders, order } = req.body;

  try {
    if (orders) {
      const newCID = await syncOrdersToIPFS(orders);
      res.json({ success: true, ipfsCID: newCID });
    } else if (order) {
      const encryptedOrder = encryptOrder(order, ENCRYPTION_KEY);
      ordersCache.push(encryptedOrder);
      const newCID = await syncOrdersToIPFS(ordersCache);
      res.json({ success: true, ipfsCID: newCID });
    } else {
      res.status(400).json({ error: 'Invalid request body' });
    }
  } catch (err) {
    console.error('Failed to process order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, async () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
  await startNode();
});
