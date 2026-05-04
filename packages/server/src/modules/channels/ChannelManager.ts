import { Keypair, Horizon } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { redis } from '../../utils/redis';
import { sequenceManager } from './SequenceManager';

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
  private horizon: Horizon.Server;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.horizon = new Horizon.Server(config.horizonUrl);
  }

  async initialize() {
    if (!config.channelSeedPhrase) {
      throw new Error('CHANNEL_SEED_PHRASE is not configured');
    }

    logger.info('Initializing Fee Channel Manager...');

    const seed = await bip39.mnemonicToSeed(config.channelSeedPhrase);
    
    for (let i = 0; i < config.channelCount; i++) {
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

    await sequenceManager.syncAll(this.publicKeys);
    await this.verifyChannels();
    this.startCleanupInterval();
    
    const health = await this.getPoolHealth();
    logger.info({ 
      msg: 'Channel Manager initialized', 
      total: health.total,
      funded: health.funded,
      totalXlm: health.totalXlm
    });
  }

  private async verifyChannels() {
    const minBalance = config.network === 'mainnet' ? 10 : 2;
    let totalXlm = 0;

    for (const publicKey of this.publicKeys) {
      const channel = this.channels.get(publicKey)!;
      try {
        const account = await this.horizon.loadAccount(publicKey);
        const nativeBalance = account.balances.find(b => b.asset_type === 'native');
        const balance = nativeBalance ? nativeBalance.balance : '0';
        channel.balance = balance;
        totalXlm += parseFloat(balance);

        if (parseFloat(balance) < minBalance) {
          logger.warn({ msg: 'Low channel balance', publicKey, balance, minBalance });
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          if (config.network === 'testnet') {
            logger.info({ msg: 'Funding new testnet channel account via Friendbot', publicKey });
            try {
              const fbResponse = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
              if (fbResponse.ok) {
                logger.info({ msg: 'Successfully funded channel account', publicKey });
                channel.status = 'available';
                channel.balance = '10000.00'; // Friendbot default
              } else {
                logger.error({ msg: 'Friendbot funding failed', publicKey, status: fbResponse.status });
                channel.status = 'error';
              }
            } catch (fbErr: any) {
              logger.error({ msg: 'Error calling Friendbot', publicKey, err: fbErr.message });
              channel.status = 'error';
            }
          } else {
            channel.status = 'error';
            logger.error({ msg: 'Channel account not found on network', publicKey });
          }
        } else {
          logger.error({ msg: 'Error verifying channel', publicKey, err: err.message });
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
          logger.warn({ msg: 'Stale lock detected, releasing channel', publicKey });
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
        // Set lock in Redis with 30s TTL
        const acquired = await redis.set(lockKey, 'locked', 'EX', 30, 'NX');
        
        if (acquired) {
          channel.status = 'locked';
          channel.lockedAt = Date.now();
          this.currentIndex = (idx + 1) % this.publicKeys.length;
          return channel;
        }
      }
    }

    return null;
  }

  async release(publicKey: string) {
    const channel = this.channels.get(publicKey);
    if (!channel) return;

    await redis.del(`channel:lock:${publicKey}`);
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

export const channelManager = new ChannelManager();
