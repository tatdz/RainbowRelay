import dotenv from 'dotenv';
dotenv.config();

process.env.PORT = '0';
process.env.SEPOLIA_RPC_URL = 'http://mock.rpc.url';
process.env.LIMIT_ORDER_CONTRACT = '0xMockContract';
process.env.DEFENDER_API_KEY = 'mock-key';
process.env.DEFENDER_API_SECRET = 'mock-secret';