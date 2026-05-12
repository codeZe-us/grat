import { Keypair } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { SequenceManager } from './SequenceManager';
import { getErrorMessage } from '../../utils/error-guards';
import { StellarClient } from '../../stellar/stellar-client';

export interface ChannelAccount {
  keypair: Keypair;
  publicKey: string;
  status: 'available' | 'locked' | 'error';
  lockedAt?: number;
  lastUsedAt?: number;
  balance?: string;
}

export class ChannelManager {
  private channels: Map<string, ChannelAccount> = new Map();
  private publicKeys: string[] = [];
  private currentIndex = 0;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly redis: Redis,
    private readonly stellarClient: StellarClient,
    private readonly sequenceManager: SequenceManager,
    private readonly config: any,
    private readonly logger: Logger
  ) {}

  async initialize() {
    if (!this.config.channelSeedPhrase) {
      throw new Error('CHANNEL_SEED_PHRASE is not configured');
    }

    this.logger.info('Initializing Fee Channel Manager...');

    const seed = await bip39.mnemonicToSeed(this.config.channelSeedPhrase);
    
    for (let i = 0; i < this.config.channelCount; i++) {
      const path = `m/44'/148'/${i}'`;
      const derived = derivePath(path, seed.toString('hex'));
      const keypair = Keypair.fromRawEd25519Seed(derived.key);
      const publicKey = keypair.publicKey();

      this.channels.set(publicKey, {
        keypair,
        publicKey,
        status: 'available',
      });
      this.publicKeys.push(publicKey);
    }

    await this.verifyChannels();
    const availableKeys = Array.from(this.channels.values())
      .filter(c => c.status === 'available')
      .map(c => c.publicKey);
    
    if (availableKeys.length > 0) {
      await this.sequenceManager.syncAll(availableKeys);
    } else {
      this.logger.warn('No channels available after verification. Relay will likely fail to sponsor transactions.');
    }
    
    this.startCleanupInterval();
    
    const health = await this.getPoolHealth();
    this.logger.info({ 
      msg: 'Channel Manager initialized', 
      total: health.total,
      available: availableKeys.length,
      totalXlm: health.totalXlm
    });
  }

  private async verifyChannels() {
    const minBalance = this.config.network === 'mainnet' ? 10 : 2;
    for (const publicKey of this.publicKeys) {
      const channel = this.channels.get(publicKey)!;
      try {
        const account = await this.stellarClient.getAccount(publicKey);
        const nativeBalance = account.balances.find(b => b.asset_type === 'native');
        const balance = nativeBalance ? nativeBalance.balance : '0';
        channel.balance = balance;

        if (parseFloat(balance) < minBalance) {
          this.logger.warn({ msg: 'Low channel balance', publicKey, balance, minBalance });
        }
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        const isNotFound = (err as any).response?.status === 404 || 
                           (err as any).status === 404 || 
                           (err as any).name === 'NotFoundError';

        if (isNotFound) {
          if (this.config.network === 'testnet') {
            this.logger.info({ msg: 'Funding new testnet channel account via Friendbot', publicKey });
            try {
              const fbResponse = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
              if (fbResponse.ok) {
                this.logger.info({ msg: 'Successfully funded channel account', publicKey });
                channel.status = 'available';
                channel.balance = '10000.00';
              } else {
                this.logger.error({ msg: 'Friendbot funding failed', publicKey, status: fbResponse.status });
                channel.status = 'error';
              }
            } catch (fbErr: unknown) {
              this.logger.error({ msg: 'Error calling Friendbot', publicKey, err: getErrorMessage(fbErr) });
              channel.status = 'error';
            }
          } else {
            channel.status = 'error';
            this.logger.error({ msg: 'Channel account not found on network', publicKey });
          }
        } else {
          this.logger.error({ msg: 'Error verifying channel', publicKey, err: errorMessage });
        }
      }
    }
  }

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      for (const publicKey of this.publicKeys) {
        const channel = this.channels.get(publicKey)!;
        if (channel.status === 'locked' && channel.lockedAt && now - channel.lockedAt > 30000) {
          this.logger.warn({ msg: 'Stale lock detected, releasing channel', publicKey });
          await this.release(publicKey);
        }
      }
    }, 10000);
  }

  async acquire(): Promise<ChannelAccount | null> {
    const startIdx = this.currentIndex;
    
    for (let i = 0; i < this.publicKeys.length; i++) {
      const idx = (startIdx + i) % this.publicKeys.length;
      const publicKey = this.publicKeys[idx];
      const channel = this.channels.get(publicKey)!;

      if (channel.status === 'available') {
        const lockKey = `channel:lock:${publicKey}`;
        try {
          const acquired = await this.redis.set(lockKey, 'locked', 'EX', 30, 'NX');
          
          if (acquired) {
            channel.status = 'locked';
            channel.lockedAt = Date.now();
            this.currentIndex = (idx + 1) % this.publicKeys.length;
            return channel;
          }
        } catch (err: unknown) {
          this.logger.error({ msg: 'Redis error during channel acquisition', err: getErrorMessage(err) });
        }
      }
    }

    return null;
  }

  async release(publicKey: string) {
    const channel = this.channels.get(publicKey);
    if (!channel) return;

    try {
      await this.redis.del(`channel:lock:${publicKey}`);
    } catch (err: unknown) {
      this.logger.error({ msg: 'Redis error during channel release', err: getErrorMessage(err) });
    }
    channel.status = 'available';
    channel.lockedAt = undefined;
    channel.lastUsedAt = Date.now();
  }

  getStatus() {
    return Array.from(this.channels.values()).map(c => ({
      publicKey: c.publicKey,
      status: c.status,
      balance: c.balance,
      lastUsedAt: c.lastUsedAt,
    }));
  }

  isChannelAccount(publicKey: string): boolean {
    return this.channels.has(publicKey);
  }

  async getPoolHealth() {
    let funded = 0;
    let totalXlm = 0;
    this.channels.forEach(c => {
      if (c.balance && parseFloat(c.balance) > 0) funded++;
      totalXlm += parseFloat(c.balance || '0');
    });

    return {
      total: this.publicKeys.length,
      funded,
      totalXlm: totalXlm.toFixed(2),
    };
  }

  stop() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}
