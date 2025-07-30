import express from 'express';
import cors from 'cors';
import { create as createIPFS } from 'ipfs-http-client';
import crypto from 'crypto';
import Libp2p from 'libp2p';
import Gossipsub from '@libp2p/gossipsub';
import TCP from '@libp2p/tcp';
import Mplex from '@libp2p/mplex';
import Noise from '@libp2p/noise';
import { ethers } from 'ethers';
import { DefenderRelayProvider, DefenderRelaySigner } from '@openzeppelin/defender-relay-client/lib/ethers';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const ipfs = createIPFS({ url: 'https://ipfs.infura.io:5001/api/v0' });

// --- In-memory caches ---
let ipfsOrdersCID = null;
let ordersCache = [];
let fillStatusCache = {};        // { orderHash: { filled, txHash, filledAt, ... } }
let cancellationStatusCache = {}; // { orderHash: { cancelled, txHash, cancelledAt, ... } }

// --- Robust LimitOrder Validation ---
function validateOrder(orderWrapper) {
  if (typeof orderWrapper !== 'object' || !orderWrapper) return false;
  const order = orderWrapper.order;
  const signature = orderWrapper.signature;
  if (!order || !signature) return false;

  const requiredFields = [
    'makerAsset', 'takerAsset', 'maker', 'receiver', 'allowedSender',
    'makingAmount', 'takingAmount', 'salt', 'predicate', 'permit', 'interaction',
  ];
  for (const field of requiredFields) {
    if (!order.hasOwnProperty(field)) {
      console.warn(`Order missing field: ${field}`);
      return false;
    }
  }

  const isHexBytes = (s) => typeof s === 'string' && /^0x[a-fA-F0-9]*$/.test(s);
  const isAddress = (s) => typeof s === 'string' && ethers.utils.isAddress(s);

  if (!isAddress(order.makerAsset)) return false;
  if (!isAddress(order.takerAsset)) return false;
  if (!isAddress(order.maker)) return false;
  if (!isAddress(order.receiver)) return false;
  if (!isAddress(order.allowedSender)) return false;
  if (typeof order.makingAmount !== 'string' || !/^\d+$/.test(order.makingAmount)) return false;
  if (typeof order.takingAmount !== 'string' || !/^\d+$/.test(order.takingAmount)) return false;
  if (typeof order.salt !== 'string' && typeof order.salt !== 'number') return false;
  if (!isHexBytes(order.predicate)) return false;
  if (!isHexBytes(order.permit)) return false;
  if (!isHexBytes(order.interaction)) return false;

  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]+$/.test(signature)) return false;

  return true;
}

// Order hash as keccak256(utf8(json)) of entire object for identification
function getOrderHash(orderWrapper) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(orderWrapper)));
}

// --- Onchain event listeners for OrderFilled and OrderCancelled ---
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const LIMIT_ORDER_CONTRACT = process.env.LIMIT_ORDER_CONTRACT;

const limitOrderABI = [
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makingAmount, uint256 takingAmount, bytes32 interaction)",
  "event OrderCancelled(bytes32 indexed orderHash, address indexed maker)"
];
const limitOrderContract = new ethers.Contract(LIMIT_ORDER_CONTRACT, limitOrderABI, provider);

limitOrderContract.on("OrderFilled", (orderHash, maker, taker, makingAmount, takingAmount, interaction, event) => {
  fillStatusCache[orderHash] = {
    filled: true,
    txHash: event.transactionHash,
    filledAt: Date.now(),
    maker,
    taker,
    makingAmount: makingAmount.toString(),
    takingAmount: takingAmount.toString(),
  };
  console.log(`OrderFilled event received: ${orderHash}, tx: ${event.transactionHash}`);
});

limitOrderContract.on("OrderCancelled", (orderHash, maker, event) => {
  cancellationStatusCache[orderHash] = {
    cancelled: true,
    txHash: event.transactionHash,
    cancelledAt: Date.now(),
    maker,
  };
  console.log(`OrderCancelled event received: ${orderHash}, tx: ${event.transactionHash}`);
});

// --- API Endpoints for order fill/cancel status ---
app.get('/api/order-status/:orderHash', (req, res) => {
  const orderHash = req.params.orderHash;
  const fill = fillStatusCache[orderHash] || null;
  const cancel = cancellationStatusCache[orderHash] || null;
  if(!fill && !cancel) return res.status(404).json({error: 'Status not found'});
  res.json({fill, cancel});
});
app.get('/api/order-status', (req, res) => {
  res.json({fills: fillStatusCache, cancellations: cancellationStatusCache});
});

// --- Cancel order endpoint: maker signs offchain cancellation, backend sends onchain tx ---
app.post('/api/cancel-order', async (req, res) => {
  const { order, signature, walletPrivateKey } = req.body;
  if (!order || !signature) return res.status(400).json({error: 'Order and signature required'});
  if (!walletPrivateKey) return res.status(400).json({error: 'Wallet private key required'});

  try {
    const wallet = new ethers.Wallet(walletPrivateKey, provider);
    const iface = new ethers.utils.Interface(limitOrderABI);
    // Adjust function if your deployed contract's cancel function differs
    const cancelData = iface.encodeFunctionData('cancelOrder', [order, signature]);
    const tx = {
      to: LIMIT_ORDER_CONTRACT,
      data: cancelData,
      gasLimit: 1000000,
    };

    const txResponse = await wallet.sendTransaction(tx);
    await txResponse.wait();

    res.json({success: true, txHash: txResponse.hash});
  } catch (err) {
    console.error("Cancel order err:", err);
    res.status(500).json({error: err.message});
  }
});

// --- IPFS, Libp2p Order Relay, Encryption (unchanged except improved validateOrder use) ---

app.get('/api/orders', async (req, res) => {
  if (!ipfsOrdersCID) return res.json([]);
  try {
    let result = '';
    for await (const chunk of ipfs.cat(ipfsOrdersCID)) {
      result += chunk.toString();
    }
    res.json(JSON.parse(result));
  } catch {
    res.json(ordersCache);
  }
});

app.post('/api/orders', async (req, res) => {
  const { orders, order, signature, metadata, encrypted = false, encryptKey = '' } = req.body;
  let newOrders = orders || [...ordersCache];

  if (order && signature) {
    const storedOrder = encrypted
      ? { encrypted: true, data: encryptOrder({ order, signature, metadata }, encryptKey || process.env.ENCRYPTION_KEY) }
      : { order, signature, metadata };

    if (!validateOrder(storedOrder)) {
      return res.status(400).json({ error: 'Invalid order format' });
    }

    const newOrderHash = getOrderHash(storedOrder);
    if (newOrders.find(o => getOrderHash(o) === newOrderHash)) {
      return res.status(409).json({ error: 'Duplicate order' });
    }

    newOrders.push(storedOrder);

    if (p2pNode) {
      const payload = encrypted ? storedOrder.data : JSON.stringify(storedOrder);
      p2pNode.pubsub.publish('orders', Buffer.from(payload));
    }
  }

  try {
    const newCID = await syncOrdersToIPFS(newOrders);
    return res.json({ success: true, ipfsCID: newCID });
  } catch {
    res.status(500).json({ error: 'Failed to sync orders with IPFS' });
  }
});

// --- Gasless fills / relay using Defender relayer ---
const credentials = {
  apiKey: process.env.DEFENDER_API_KEY,
  apiSecret: process.env.DEFENDER_API_SECRET,
};
const providerRelay = new DefenderRelayProvider(credentials);
const signerRelay = new DefenderRelaySigner(credentials, providerRelay, { speed: 'fast' });

app.post('/api/gasless-fill', async (req, res) => {
  const { to, data, value = 0, gasLimit = 1000000 } = req.body;

  // Optionally parse/track gasStation interaction here, for future relay economics, omitted for brevity

  try {
    const txResponse = await signerRelay.sendTransaction({ to, data, value, gasLimit });
    return res.json({ success: true, transactionHash: txResponse.hash });
  } catch (error) {
    console.error('Gasless relay error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Libp2p setup unchanged ---

let p2pNode;
async function createP2PNode() {
  // Existing libp2p create/start code here...
}
createP2PNode().then(node => { p2pNode = node; });

app.listen(PORT, () => {
  console.log(`🚀 Backend listening at http://localhost:${PORT}`);
});
