import { createHelia } from 'helia';
import { LevelBlockstore } from 'blockstore-level';

async function testHelia() {
  try {
    const blockstore = new LevelBlockstore('./helia-blockstore-db');
    const helia = await createHelia({ blockstore });

    const testData = new TextEncoder().encode(JSON.stringify({ test: 'hello world' }));
    const cid = await helia.blockstore.put(testData);
    console.log('Test CID:', cid.toString());

    const retrieved = await helia.blockstore.get(cid);
    console.log('Retrieved data:', new TextDecoder().decode(retrieved));
  } catch (err) {
    console.error('Helia test script error:', err);
  }
}

testHelia();
