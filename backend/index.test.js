import request from 'supertest';
import { jest } from '@jest/globals';
import { app } from '../backend/index.js';

// =============================================
// COMPLETE MOCK SETUP
// =============================================

// Mock IPFS client
jest.mock('ipfs-http-client', () => ({
  create: jest.fn(() => ({
    cat: jest.fn().mockImplementation(async function* () {
      yield Buffer.from(JSON.stringify([{ id: 1, test: 'order' }]));
    }),
    add: jest.fn().mockResolvedValue({ cid: 'mockCID' })
  }))
}));

// Mock Libp2p and components
jest.mock('libp2p', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    pubsub: {
      publish: jest.fn(),
      subscribe: jest.fn(),
      getSubscribers: jest.fn().mockReturnValue([])
    },
    start: jest.fn(),
    stop: jest.fn(),
    isStarted: jest.fn().mockReturnValue(true)
  }))
}));

jest.mock('@libp2p/gossipsub', () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock('@libp2p/tcp', () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock('@libp2p/mplex', () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock('@libp2p/noise', () => ({
  __esModule: true,
  default: jest.fn()
}));

// Mock Ethers with complete implementation
jest.mock('ethers', () => {
  const original = jest.requireActual('ethers');
  return {
    ...original,
    ethers: {
      ...original.ethers,
      Contract: jest.fn(() => ({
        on: jest.fn(),
        off: jest.fn(),
        queryFilter: jest.fn().mockResolvedValue([]),
        filters: {
          OrderFilled: jest.fn(),
          OrderCancelled: jest.fn()
        }
      })),
      Wallet: jest.fn(() => ({
        sendTransaction: jest.fn().mockResolvedValue({
          hash: '0x123',
          wait: jest.fn().mockResolvedValue({ status: 1 })
        }),
        getAddress: jest.fn().mockResolvedValue('0xMockAddress')
      })),
      providers: {
        ...original.ethers.providers,
        JsonRpcProvider: jest.fn(() => ({
          getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
          getBlockNumber: jest.fn().mockResolvedValue(123456),
          send: jest.fn()
        }))
      },
      utils: {
        ...original.ethers.utils,
        isAddress: jest.fn().mockReturnValue(true),
        keccak256: jest.fn().mockReturnValue('0xmockedhash'),
        toUtf8Bytes: jest.fn().mockReturnValue(new Uint8Array()),
        Interface: jest.fn(),
        formatEther: jest.fn().mockReturnValue('1.0'),
        parseEther: jest.fn().mockReturnValue('1000000000000000000')
      }
    }
  };
});

// Mock Defender Relay
jest.mock('@openzeppelin/defender-relay-client/lib/ethers', () => ({
  DefenderRelayProvider: jest.fn(() => ({
    send: jest.fn(),
    getSigner: jest.fn()
  })),
  DefenderRelaySigner: jest.fn(() => ({
    sendTransaction: jest.fn().mockResolvedValue({
      hash: '0xdefender',
      wait: jest.fn().mockResolvedValue({ status: 1 })
    }),
    getAddress: jest.fn().mockResolvedValue('0xDefenderAddress')
  }))
}));

// =============================================
// TEST SUITE
// =============================================

describe('Backend API Integration Tests', () => {
  let server;

  beforeAll((done) => {
    server = app.listen(0, () => {
      console.log(`Test server running on port ${server.address().port}`);
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('Order Management', () => {
    test('GET /api/orders returns list of orders', async () => {
      const res = await request(server).get('/api/orders');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('POST /api/orders with invalid order returns 400', async () => {
      const res = await request(server).post('/api/orders').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('POST /api/orders with valid order returns success', async () => {
      const validOrder = {
        order: {
          makerAsset: '0xMakerAsset',
          takerAsset: '0xTakerAsset',
          maker: '0xMaker',
          receiver: '0xReceiver',
          allowedSender: '0xAllowedSender',
          makingAmount: '100',
          takingAmount: '200',
          salt: '123',
          predicate: '0xPredicate',
          permit: '0xPermit',
          interaction: '0xInteraction'
        },
        signature: '0xSignature'
      };
      const res = await request(server).post('/api/orders').send(validOrder);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('ipfsCID');
    });
  });

  describe('Darkpool Operations', () => {
    test('POST /api/darkpools/join successfully joins pool', async () => {
      const res = await request(server)
        .post('/api/darkpools/join')
        .send({ poolName: 'whales', peerId: 'peerTest' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    test('POST /api/darkpools/join with missing params returns 400', async () => {
      const res = await request(server)
        .post('/api/darkpools/join')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Reputation System', () => {
    test('GET /api/reputation/peers returns peer list', async () => {
      const res = await request(server).get('/api/reputation/peers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Order Status Tracking', () => {
    test('GET /api/order-status returns status objects', async () => {
      const res = await request(server).get('/api/order-status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('fills');
      expect(res.body).toHaveProperty('cancellations');
    });

    test('GET /api/order-status/:hash returns specific status', async () => {
      const res = await request(server).get('/api/order-status/mockHash');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('fill');
      expect(res.body).toHaveProperty('cancel');
    });
  });

  describe('Gasless Transactions', () => {
    test('POST /api/gasless-fill executes successfully', async () => {
      const res = await request(server)
        .post('/api/gasless-fill')
        .send({ 
          to: '0xRecipient',
          data: '0xData',
          value: '0',
          gasLimit: '1000000'
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('transactionHash');
    });
  });

  describe('Order Cancellation', () => {
    test('POST /api/cancel-order cancels successfully', async () => {
      const res = await request(server)
        .post('/api/cancel-order')
        .send({
          order: {
            makerAsset: '0xAsset',
            maker: '0xMaker'
          },
          signature: '0xSignature',
          walletPrivateKey: 'mockKey'
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('txHash');
    });
  });
});