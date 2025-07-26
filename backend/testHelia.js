import { createHelia } from 'helia';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { mdns } from '@libp2p/mdns';
import { LevelBlockstore } from 'blockstore-level';

async function testHelia() {
  // 1. Create and start libp2p node first
  const libp2pNode = await createLibp2p({
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
    },
    peerDiscovery: [mdns({ interval: 10000 })],
  });
  await libp2pNode.start();

  // 2. Create Helia with LevelBlockstore and this libp2p node
  const blockstore = new LevelBlockstore('./helia-blockstore-db');
  const heliaNode = await createHelia({
    blockstore,
    libp2p: libp2pNode,
  });

  console.log('Blockstore in test:', heliaNode.blockstore.constructor.name);

  // 3. Put some data
  const data = new TextEncoder().encode('hello world');
  const cid = await heliaNode.blockstore.put(data);
  console.log('Stored CID:', cid.toString());
}

testHelia().catch(console.error);
