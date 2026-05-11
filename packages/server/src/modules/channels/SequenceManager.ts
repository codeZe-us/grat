import { Horizon } from '@stellar/stellar-sdk';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { getErrorMessage } from '../../utils/error-guards';

export class SequenceManager {
  constructor(
    private readonly redis: Redis,
    private readonly horizon: Horizon.Server,
    private readonly logger: Logger
  ) {}

  /**
   * Loads the current sequence number from Horizon and caches it in Redis.
   */
  async sync(publicKey: string): Promise<string> {
    try {
      const account = await this.horizon.loadAccount(publicKey);
      const sequence = account.sequenceNumber();
      
      // Store in Redis
      await this.redis.set(`sequence:${publicKey}`, sequence);
      
      this.logger.debug({ msg: 'Synced sequence number', publicKey, sequence });
      return sequence;
    } catch (err: unknown) {
      this.logger.error({ 
        msg: 'Failed to sync sequence number', 
        publicKey, 
        err: getErrorMessage(err) 
      });
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
    const nextSeq = await this.redis.incr(key);
    
    return nextSeq.toString();
  }

  /**
   * Useful for initialization: syncs all channels in a list.
   */
  async syncAll(publicKeys: string[]) {
    this.logger.info(`Syncing sequence numbers for ${publicKeys.length} channels...`);
    await Promise.all(publicKeys.map(pk => this.sync(pk)));
  }
}
