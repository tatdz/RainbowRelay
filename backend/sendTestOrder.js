import fetch from 'node-fetch';

async function sendTestOrder() {
  const orderPayload = {
    order: {
      makerAsset: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC token address example
      takerAsset: '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI token address example
      maker: '0x1234567890abcdef1234567890abcdef12345678',   // example maker address
    },
    signature: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef', // example signature
    metadata: {
      submittedAt: Math.floor(Date.now() / 1000), // current UNIX timestamp
    },
    encrypted: false,
  };

  try {
    const response = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send test order:', errorText);
      return;
    }

    const data = await response.json();
    console.log('Test order response:', data);
  } catch (err) {
    console.error('Error sending test order:', err);
  }
}

sendTestOrder();
