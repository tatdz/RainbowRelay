import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'crypto';
import { encryptOrder, decryptOrder, generateOrderID, ENCRYPTION_KEY } from './utils.js';

describe('utils.js encryption and ID generation', () => {
  const sampleOrder = { maker: '0xabc', taker: '0xdef', amount: 1000 };
  const key = crypto.createHash('sha256').update('testkey').digest();

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  test('encryptOrder and decryptOrder consistency', () => {
    const encrypted = encryptOrder(sampleOrder, key);
    expect(typeof encrypted).toBe('string');
    const decrypted = decryptOrder(encrypted, key);
    expect(decrypted).toEqual(sampleOrder);
  });

  test('generateOrderID returns a string with prefix', () => {
    const prefix = 'test-';
    const id = generateOrderID(prefix);
    expect(id.startsWith(prefix)).toBe(true);
    expect(id.length).toBeGreaterThan(prefix.length);
  });

  test('ENCRYPTION_KEY returns Buffer when env var is set', () => {
    const keyFromEnv = ENCRYPTION_KEY.value;
    expect(Buffer.isBuffer(keyFromEnv)).toBe(true);
    expect(keyFromEnv.length).toBe(32);
  });

  test('ENCRYPTION_KEY returns null when env var is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    const keyFromEnv = ENCRYPTION_KEY.value;
    expect(keyFromEnv).toBeNull();
  });
});