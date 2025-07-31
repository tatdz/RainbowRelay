import crypto from 'crypto';

export class EncryptionService {
  private masterKey: string;
  private poolKeys: Map<string, string>;

  constructor() {
    const masterKey = process.env.ENCRYPTION_KEY;
    const whalesKey = process.env.POOL_WHALES_KEY;
    const institutionsKey = process.env.POOL_INSTITUTIONS_KEY;

    if (!masterKey || !whalesKey || !institutionsKey) {
      throw new Error('Missing required encryption keys in environment variables');
    }

    this.masterKey = masterKey;
    this.poolKeys = new Map([
      ['whales', whalesKey],
      ['institutions', institutionsKey]
    ]);
  }

  encryptOrder(order: any, poolName: string): { encrypted: string; iv: string } {
    const poolKey = this.poolKeys.get(poolName);
    if (!poolKey) {
      throw new Error(`Unknown pool: ${poolName}`);
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-ctr', poolKey);
    
    const orderData = JSON.stringify(order);
    let encrypted = cipher.update(orderData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex')
    };
  }

  decryptOrder(encryptedData: string, iv: string, poolName: string): any {
    const poolKey = this.poolKeys.get(poolName);
    if (!poolKey) {
      throw new Error(`Unknown pool: ${poolName}`);
    }

    const decipher = crypto.createDecipher('aes-256-ctr', poolKey);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  hasPoolAccess(poolName: string): boolean {
    return this.poolKeys.has(poolName);
  }

  getAvailablePools(): string[] {
    return Array.from(this.poolKeys.keys());
  }
}