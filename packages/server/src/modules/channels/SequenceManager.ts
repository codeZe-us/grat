import { StellarClient } from '../../stellar/stellar-client';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { getErrorMessage } from '../../utils/error-guards';

export class SequenceManager {
  constructor(
    private readonly redis: Redis,
    private readonly stellarClient: StellarClient,
    private readonly logger: Logger
  ) {}

  async sync(publicKey: string): Promise<string> {
    try {
      const sequence = await this.stellarClient.getSequenceNumber(publicKey);
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

  async getNext(publicKey: string): Promise<string> {
    const key = `sequence:${publicKey}`;
    const nextSeq = await this.redis.incr(key);
    return nextSeq.toString();
  }

  async syncAll(publicKeys: string[]) {
    this.logger.info(`Syncing sequence numbers for ${publicKeys.length} channels...`);
    await Promise.all(publicKeys.map(pk => this.sync(pk)));
  }
}
