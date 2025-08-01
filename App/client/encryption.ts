// Client-side encryption utilities for PonyHof dark pools

export interface EncryptedOrder {
  encrypted: string;
  iv: string;
  poolName: string;
}

// AES-256-CTR encryption using Web Crypto API
export class ClientEncryption {
  private poolKeys = new Map<string, string>();

  constructor() {
    // In a real implementation, these keys would be obtained securely
    // For demo purposes, we'll use placeholder keys
    this.poolKeys.set('whales', 'demo-whales-key-32-bytes-long!!!');
    this.poolKeys.set('institutions', 'demo-institutions-key-32-bytes!');
  }

  async encryptOrder(order: any, poolName: string): Promise<EncryptedOrder> {
    const poolKey = this.poolKeys.get(poolName);
    if (!poolKey) {
      throw new Error(`Unknown pool: ${poolName}`);
    }

    try {
      // Convert string key to CryptoKey
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(poolKey.padEnd(32, '0').slice(0, 32)),
        { name: 'AES-CTR' },
        false,
        ['encrypt']
      );

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(16));

      // Encrypt the order
      const orderData = new TextEncoder().encode(JSON.stringify(order));
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: iv, length: 128 },
        keyMaterial,
        orderData
      );

      return {
        encrypted: Array.from(new Uint8Array(encryptedBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        iv: Array.from(iv)
          .map(b => b.toString(16).padStart(2, '0'))
          .join(''),
        poolName
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt order');
    }
  }

  async decryptOrder(encryptedData: EncryptedOrder): Promise<any> {
    const poolKey = this.poolKeys.get(encryptedData.poolName);
    if (!poolKey) {
      throw new Error(`Unknown pool: ${encryptedData.poolName}`);
    }

    try {
      // Convert string key to CryptoKey
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(poolKey.padEnd(32, '0').slice(0, 32)),
        { name: 'AES-CTR' },
        false,
        ['decrypt']
      );

      // Convert hex strings back to Uint8Arrays
      const iv = new Uint8Array(
        encryptedData.iv.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      const encrypted = new Uint8Array(
        encryptedData.encrypted.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []
      );

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: iv, length: 128 },
        keyMaterial,
        encrypted
      );

      const decryptedString = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt order');
    }
  }

  hasPoolAccess(poolName: string): boolean {
    return this.poolKeys.has(poolName);
  }

  getAvailablePools(): string[] {
    return Array.from(this.poolKeys.keys());
  }
}

export const clientEncryption = new ClientEncryption();