// index.js

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), debug: false });

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

import * as ethers from 'ethers';

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { mplex } from '@libp2p/mplex';
import { noise } from '@chainsafe/libp2p-noise';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { kadDHT } from '@libp2p/kad-dht';
import { mdns } from '@libp2p/mdns';

import { LevelBlockstore } from 'blockstore-level';
import { createHelia } from 'helia';
import { createBitswap } from '@helia/bitswap';

import { CID } from 'multiformats/cid';
import { encode, decode } from 'multiformats/block';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Validate required environment variables
const requiredEnvVars = ['LIMIT_ORDER_CONTRACT', 'SEPOLIA_RPC_URL', 'RELAYER_PRIVATE_KEY'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) throw new Error(`Missing environment variable: ${v}`);
}

const blockstoreDir = process.env.BLOCKSTORE_DIR || './helia-blockstore-db';
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || null;
const ENCRYPTION_KEY = ENCRYPTION_SECRET
  ? crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest()
  : null;

// Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
const LIMIT_ORDER_CONTRACT = process.env.LIMIT_ORDER_CONTRACT;

const limitOrderABI = [
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makingAmount, uint256 takingAmount, bytes32 interaction)",
  "event OrderCancelled(bytes32 indexed orderHash, address indexed maker)",
];

const limitOrderContract = new ethers.Contract(LIMIT_ORDER_CONTRACT, limitOrderABI, wallet);

// Caches and state
let ipfsOrdersCID = null;
let ordersCache = [];
let fillStatusCache = {};
let cancellationStatusCache = {};

function encryptOrder(order, key) {
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([cipher.update(JSON.stringify(order)), cipher.final()]).toString('hex');
}

function decryptOrder(encryptedHex, key) {
  const iv = Buffer.alloc(16, 0);
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString());
}

function validateOrder(orderWrapper) {
  if (!orderWrapper || typeof orderWrapper !== 'object' || orderWrapper.encrypted) return false;
  const { order, signature } = orderWrapper;
  if (!order || !signature) return false;

  const requiredFields = [
    'makerAsset', 'takerAsset', 'maker', 'receiver', 'allowedSender',
    'makingAmount', 'takingAmount', 'salt', 'predicate', 'permit', 'interaction',
  ];

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(order, field)) return false;
  }

  const isHex = s => typeof s === 'string' && /^0x[a-fA-F0-9]*$/.test(s);
  const isAddress = s => typeof s === 'string' && ethers.isAddress(s);

  if (!isAddress(order.makerAsset)) return false;
  if (!isAddress(order.takerAsset)) return false;
  if (!isAddress(order.maker)) return false;
  if (!isAddress(order.receiver)) return false;
  if (!isAddress(order.allowedSender)) return false;
  if (typeof order.makingAmount !== 'string' || !/^\d+$/.test(order.makingAmount)) return false;
  if (typeof order.takingAmount !== 'string' || !/^\d+$/.test(order.takingAmount)) return false;
  if (typeof order.salt !== 'string' && typeof order.salt !== 'number') return false;
  if (!isHex(order.predicate)) return false;
  if (!isHex(order.permit)) return false;
  if (!isHex(order.interaction)) return false;
  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]+$/.test(signature)) return false;

  return true;
}

function getOrderHash(orderWrapper) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(orderWrapper)));
}

// Ethereum event listeners
limitOrderContract.on('OrderFilled', (orderHash, maker, taker, makingAmount, takingAmount, interaction, event) => {
  fillStatusCache[orderHash] = {
    filled: true,
    txHash: event.transactionHash,
    filledAt: Date.now(),
    maker,
    taker,
    makingAmount: makingAmount.toString(),
    takingAmount: takingAmount.toString(),
  };
  console.log(`OrderFilled event: ${orderHash}, tx: ${event.transactionHash}`);
});

limitOrderContract.on('OrderCancelled', (orderHash, maker, event) => {
  cancellationStatusCache[orderHash] = {
    cancelled: true,
    txHash: event.transactionHash,
    cancelledAt: Date.now(),
    maker,
  };
  console.log(`OrderCancelled event: ${orderHash}, tx: ${event.transactionHash}`);
});

const mockLogger = {
  forComponent: (name) => ({
    debug: (...args) => console.debug(`[${name}][DEBUG]:`, ...args),
    info: (...args) => console.info(`[${name}][INFO]:`, ...args),
    warn: (...args) => console.warn(`[${name}][WARN]:`, ...args),
    error: (...args) => console.error(`[${name}][ERROR]:`, ...args),
  }),
};

let libp2pNode;
let heliaNode;
let bitswap;

const blockstore = new LevelBlockstore(blockstoreDir);

async function startLibp2p() {
  await blockstore.open();

  libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    streamMuxers: [mplex()],
    connectionEncrypters: [noise()],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true, emitSelf: false }),
      mdns: mdns({ interval: 10000, serviceTag: 'ponyhof' }),
      dht: kadDHT({ enabled: true, clientMode: false, randomWalk: { enabled: true } }),
    },
    connectionManager: { minConnections: 1, maxConnections: 10, autoDial: true },
  });

  await libp2pNode.start();
  console.log('✅ libp2p started with peerId:', libp2pNode.peerId.toString());

  bitswap = await createBitswap({
    libp2p: libp2pNode,
    blockstore,
    logger: mockLogger,
  });

  heliaNode = await createHelia({
    libp2p: libp2pNode,
    blockstore,
    bitswap,
  });

  if (libp2pNode.services?.dht) {
    heliaNode.contentRouting = libp2pNode.services.dht;
    console.log('✅ Helia content routing set from KadDHT');
  } else {
    console.warn('⚠️ Helia content routing missing (DHT not available)');
  }

  await libp2pNode.services.pubsub.subscribe('orders');
  console.log('✅ Subscribed to pubsub topic "orders"');

  // Defensive peer events
  libp2pNode.addEventListener('peer:discovery', async (evt) => {
    const peerId = evt.detail?.id;
    if (!peerId) {
      console.warn('peer:discovery event missing id');
      return;
    }
    console.log('🔍 Discovered peer:', peerId.toString());
    try {
      await libp2pNode.dial(peerId);
      console.log('🤝 Dialed peer:', peerId.toString());
    } catch (err) {
      console.warn('Failed to dial discovered peer:', peerId.toString(), err);
    }
  });

  libp2pNode.addEventListener('peer:connect', (evt) => {
    const peerId = evt.detail?.remotePeer;
    if (!peerId) {
      console.warn('peer:connect event missing remotePeer');
      return;
    }
    console.log('🔗 Connected to peer:', peerId.toString());
  });

  libp2pNode.addEventListener('peer:disconnect', (evt) => {
    const peerId = evt.detail?.remotePeer;
    if (!peerId) {
      console.warn('peer:disconnect event missing remotePeer');
      return;
    }
    console.log('❌ Disconnected from peer:', peerId.toString());
  });

  libp2pNode.services.pubsub.addEventListener('message', async (evt) => {
    if (evt.detail.topic !== 'orders') return;
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
      const hash = getOrderHash(order);
      if (!ordersCache.some(o => getOrderHash(o) === hash)) {
        ordersCache.push(order);
        console.log('📦 Received order via pubsub:', order);
      }
    } catch (err) {
      console.error('Error handling pubsub message:', err);
    }
  });

  // Setup periodic reproviding every 12 hours to keep the CID available on DHT
  setupPeriodicReprovider();

  return libp2pNode;
}

const PROVIDE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

function setupPeriodicReprovider() {
  if (!heliaNode?.contentRouting) {
    console.warn('Cannot setup periodic reproviding: contentRouting not ready');
    return;
  }
  setInterval(async () => {
    if (!ipfsOrdersCID) {
      // No CID to provide yet
      return;
    }
    try {
      const cid = CID.parse(ipfsOrdersCID);
      await heliaNode.contentRouting.provide(cid);
      console.log(`🔄 Reprovided CID ${cid.toString()} to IPFS DHT`);
    } catch (err) {
      console.warn('Failed to reprovide CID:', err);
    }
  }, PROVIDE_INTERVAL_MS);
}

async function syncOrdersToIPFS(orders) {
  const encoded = new TextEncoder().encode(JSON.stringify(orders));
  let block;
  try {
    block = await encode({ value: encoded, codec: raw, hasher: sha256 });
  } catch (e) {
    console.error('Encoding orders to block failed:', e);
    throw e;
  }

  try {
    await blockstore.put(block.cid, block.bytes);
  } catch (err) {
    console.error('Error writing to blockstore:', err);
    throw err;
  }

  ipfsOrdersCID = block.cid.toString();
  ordersCache = orders;

  if (heliaNode.contentRouting?.provide) {
    try {
      await heliaNode.contentRouting.provide(block.cid);
      console.log('📡 Provided CID:', block.cid.toString());
    } catch (err) {
      console.warn('Provide CID error:', err);
    }
  } else {
    console.warn('⚠️ No content routing available to provide CID');
  }

  await new Promise((r) => setTimeout(r, 2000)); // Wait before pubsub publish

  if (libp2pNode?.services?.pubsub) {
    try {
      await libp2pNode.services.pubsub.publish('orders', encoded);
      console.log('📢 Published orders to pubsub');
    } catch (err) {
      if (err.code === 'PublishError.NoPeersSubscribedToTopic') {
        console.warn('No peers subscribed; ignoring publish error');
      } else {
        console.error('Pubsub publish error:', err);
      }
    }
  } else {
    console.warn('Pubsub service unavailable; skipping publish');
  }

  return ipfsOrdersCID;
}

// --- Express API endpoints ---

app.get('/api/order-status/:orderHash', (req, res) => {
  const orderHash = req.params.orderHash;
  const fill = fillStatusCache[orderHash] || null;
  const cancel = cancellationStatusCache[orderHash] || null;
  if (!fill && !cancel) return res.status(404).json({ error: 'Status not found' });
  res.json({ fill, cancel });
});

app.get('/api/order-status', (_req, res) => {
  res.json({ fills: fillStatusCache, cancellations: cancellationStatusCache });
});

app.get('/api/orders', async (_req, res) => {
  if (!ipfsOrdersCID) return res.json(ordersCache);
  try {
    const cid = CID.parse(ipfsOrdersCID);
    const bytes = await blockstore.get(cid);
    const block = await decode({ cid, bytes, codec: raw, hasher: sha256 });
    res.json(JSON.parse(new TextDecoder().decode(block.value)));
  } catch (e) {
    console.warn('IPFS read failed, returning cache:', e);
    res.json(ordersCache);
  }
});

app.post('/api/orders', async (req, res) => {
  const { orders, order, signature, metadata, encrypted = false, encryptKey = ENCRYPTION_KEY } = req.body;

  let newOrders = orders ? [...orders] : [...ordersCache];
  if (order && signature) {
    let storedOrder;
    try {
      if (encrypted) {
        const decryptedOrder = typeof order === 'string' ? decryptOrder(order, encryptKey) : order;
        storedOrder = { ...decryptedOrder, signature, metadata };
      } else {
        storedOrder = { order, signature, metadata };
      }
    } catch {
      return res.status(400).json({ error: 'Invalid encrypted order format' });
    }

    if (!validateOrder(storedOrder)) return res.status(400).json({ error: 'Invalid order format' });

    const newOrderHash = getOrderHash(storedOrder);
    if (newOrders.some(o => getOrderHash(o) === newOrderHash))
      return res.status(409).json({ error: 'Duplicate order' });

    newOrders.push(storedOrder);

    if (libp2pNode?.services?.pubsub) {
      const payload = encrypted ? encryptOrder(storedOrder, encryptKey) : JSON.stringify(storedOrder);
      try {
        await libp2pNode.services.pubsub.publish('orders', Buffer.from(payload));
      } catch (e) {
        if (e.code === 'PublishError.NoPeersSubscribedToTopic') {
          console.warn('No peers subscribed; ignoring pubsub publish error');
        } else {
          return res.status(500).json({ error: 'Failed to publish order' });
        }
      }
    }
  }

  try {
    const newCID = await syncOrdersToIPFS(newOrders);
    ipfsOrdersCID = newCID;
    ordersCache = newOrders;
    return res.json({ success: true, ipfsCID: newCID });
  } catch (e) {
    console.error('Failed to sync orders with IPFS:', e);
    return res.status(500).json({ error: 'Failed to sync orders with IPFS' });
  }
});

app.post('/api/cancel-order', async (req, res) => {
  const { order, signature, walletPrivateKey } = req.body;
  if (!order || !signature || !walletPrivateKey) {
    return res.status(400).json({ error: 'Order, signature, and walletPrivateKey are required' });
  }
  try {
    const signerWallet = new ethers.Wallet(walletPrivateKey, provider);
    const iface = new ethers.Interface(limitOrderABI);
    const cancelData = iface.encodeFunctionData('cancelOrder', [order, signature]);
    const tx = { to: LIMIT_ORDER_CONTRACT, data: cancelData, gasLimit: 1_000_000 };
    const txResponse = await signerWallet.sendTransaction(tx);
    await txResponse.wait();
    res.json({ success: true, txHash: txResponse.hash });
  } catch (e) {
    console.error('Cancel order error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/gasless-fill', async (req, res) => {
  const { to, data, value = 0, gasLimit = 1_000_000 } = req.body;
  try {
    const txResponse = await wallet.sendTransaction({ to, data, value, gasLimit });
    await txResponse.wait();
    res.json({ success: true, transactionHash: txResponse.hash });
  } catch (e) {
    console.error('Gasless fill error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/peers', (_req, res) => {
  const peers = libp2pNode ? Array.from(libp2pNode.getPeers()).map(p => p.toString()) : [];
  res.json({ peers });
});

app.get('/api/addresses', (_req, res) => {
  const addresses = libp2pNode ? libp2pNode.getMultiaddrs().map(a => a.toString()) : [];
  res.json({ addresses });
});

// Start server and graceful shutdown
async function startServer() {
  try {
    await startLibp2p();
    app.listen(PORT, () => console.log(`🚀 Backend listening at http://localhost:${PORT}`));

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down...');
      try {
        if (libp2pNode) await libp2pNode.stop();
        if (heliaNode) await heliaNode.stop();
        if (blockstore && blockstore.status === 'open') await blockstore.close();
      } catch (e) {
        console.error('Error during shutdown:', e);
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start backend:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
