import { Horizon } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { redis } from '../../utils/redis';

export class SequenceManager {
  private horizon: Horizon.Server;

  constructor() {
    this.horizon = new Horizon.Server(config.horizonUrl);
  }

  /**
   * Loads the current sequence number from Horizon and caches it in Redis.
   */
  async sync(publicKey: string): Promise<string> {
    try {
      const account = await this.horizon.loadAccount(publicKey);
      const sequence = account.sequenceNumber();
      
      // Store in Redis
      await redis.set(`sequence:${publicKey}`, sequence);
      
      logger.debug({ msg: 'Synced sequence number', publicKey, sequence });
      return sequence;
    } catch (err: any) {
      logger.error({ msg: 'Failed to sync sequence number', publicKey, err: err.message });
      throw err;
    }
  }

  /**
   * Gets the next sequence number to use for a transaction.
   * Increments atomically in Redis.
   */
  async getNext(publicKey: string): Promise<string> {
    const key = `sequence:${publicKey}`;
    
    // Increment in Redis and get the new value
    // Note: Stellar sequence numbers are BigInt strings. Redis INCR works on integers.
    // Since Stellar sequence numbers fit in 64-bit integers, Redis INCR is safe.
    const nextSeq = await redis.incr(key);
    
    return nextSeq.toString();
  }

  /**
   * Useful for initialization: syncs all channels in a list.
   */
  async syncAll(publicKeys: string[]) {
    logger.info(`Syncing sequence numbers for ${publicKeys.length} channels...`);
    await Promise.all(publicKeys.map(pk => this.sync(pk)));
  }
}

export const sequenceManager = new SequenceManager();
