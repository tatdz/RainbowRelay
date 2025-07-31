import { app } from '../index.js';
import http from 'http';
import crypto from 'crypto';

const TEST_PORT = 3001;
let testServer;

function generateTestOrder() {
  return {
    order: {
      makerAsset: '0x' + crypto.randomBytes(20).toString('hex'),
      takerAsset: '0x' + crypto.randomBytes(20).toString('hex'),
      maker: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      makingAmount: '1000000000000000000',
      takingAmount: '2000000000000000000',
      salt: Date.now().toString(),
      receiver: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      allowedSender: '0x0000000000000000000000000000000000000000',
      predicate: '0x',
      permit: '0x',
      interaction: '0x'
    },
    signature: '0x' + crypto.randomBytes(32).toString('hex'),
    metadata: { createdAt: new Date().toISOString() }
  };
}

async function sendRequest(method, path, data = null) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => resolve({ error }));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('⏳ Starting test server...');

  const originalPort = process.env.PORT;
  process.env.PORT = TEST_PORT;

  testServer = app.listen(TEST_PORT, async () => {
    console.log(`✅ Test server running on http://localhost:${TEST_PORT}`);

    try {
      await testEndpoint('/api/peers');
      await testEndpoint('/api/addresses');

      // Retry order submission up to 3 times to mitigate transient IPFS errors
      let attempts = 0;
      let success = false;
      while (attempts < 3 && !success) {
        try {
          await testOrderSubmission();
          success = true;
        } catch (err) {
          attempts++;
          console.warn(`Order submission attempt ${attempts} failed:`, err);
          if (attempts < 3) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
      if (!success) {
        console.error('❌ Order submission failed after 3 attempts');
      }
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      console.log('\n🧹 Test completed');
      process.env.PORT = originalPort;
      testServer?.close();
    }
  });
}

async function testEndpoint(path) {
  console.log(`\n🔍 Testing GET ${path}`);
  const { status, data } = await sendRequest('GET', path);
  console.log(`📊 Response (${status}):`, JSON.stringify(data, null, 2));
  return data;
}

async function testOrderSubmission() {
  const testOrder = generateTestOrder();
  console.log('\n➕ Submitting test order:');

  const { status, data, error } = await sendRequest('POST', '/api/orders', {
    order: testOrder.order,
    signature: testOrder.signature
  });

  if (error) throw error;

  if (status === 200) {
    console.log('✅ Order submission successful');
    console.log('📦 Response data:', JSON.stringify(data, null, 2));

    const orders = await testEndpoint('/api/orders');
    const orderExists = orders.some(o =>
      o.order?.salt === testOrder.order.salt
    );
    console.log(orderExists ? '✅ Order found in list' : '⚠️ Order not in list');
  } else {
    console.log('❌ Order submission failed:', data?.error || 'Unknown error');
    throw new Error(data?.error || 'Order submission failed');
  }
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  testServer?.close();
  process.exit(0);
});

runTests();
