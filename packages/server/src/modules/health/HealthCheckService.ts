import { StellarClient } from '../../stellar/stellar-client';
import { Redis } from 'ioredis';
import { Knex } from 'knex';
import { Logger } from 'pino';
import { ChannelManager } from '../channels/ChannelManager';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { getErrorMessage } from '../../utils/error-guards';

export interface HealthStatus {
  status: 'ok' | 'error';
  checks: {
    stellar: { reachable: boolean; url: string; error?: string; clientType: string };
    redis: { reachable: boolean; error?: string };
    postgresql: { reachable: boolean; error?: string };
    channels: { fundedCount: number; totalCount: number; totalXlm: string };
    circuitBreaker: { isOpen: boolean; hourSpent: string; minuteSpent: string };
  };
  network: string;
}

export class HealthCheckService {
  constructor(
    private readonly stellarClient: StellarClient,
    private readonly redis: Redis,
    private readonly db: Knex,
    private readonly channelManager: ChannelManager,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly config: any,
    private readonly logger: Logger
  ) {}

  async runStartupChecks(): Promise<void> {
    this.logger.info('Running startup health checks...');

    const stellarStatus = await this.retry(() => this.checkStellarStatus(), 3, 2000);
    if (!stellarStatus?.reachable) {
      this.logger.error(`[ERROR] Stellar RPC: ${stellarStatus?.error || 'unreachable'} (${this.config.rpcUrl})`);
      process.exit(1);
    }
    this.logger.info(`[INFO] Stellar RPC: connected (${this.config.rpcUrl})`);

    const redisStatus = await this.checkRedisStatus();
    if (!redisStatus.reachable) {
      const redisUrl = new URL(this.config.redisUrl);
      this.logger.error(`[ERROR] Redis: ${redisStatus.error || 'connection failed'} (${redisUrl.host})`);
      process.exit(1);
    }
    this.logger.info(`[INFO] Redis: connected`);

    const dbStatus = await this.checkPostgresStatus();
    if (!dbStatus.reachable) {
      const dbHost = this.config.databaseUrl.split('@')[1]?.split('/')[0] || 'unknown';
      this.logger.error(`[ERROR] PostgreSQL: ${dbStatus.error || 'connection failed'} (${dbHost})`);
      this.logger.error('[ERROR] Relay cannot start. Fix the above errors and try again.');
      process.exit(1);
    }
    this.logger.info(`[INFO] PostgreSQL: connected`);

    const health = await this.channelManager.getPoolHealth();
    if (health.funded === 0) {
      const status = this.channelManager.getStatus();
      this.logger.error({
        msg: '[ERROR] Channels: No funded channels available',
        channels: status.map(c => ({ publicKey: c.publicKey, balance: c.balance }))
      });
      process.exit(1);
    }
    this.logger.info(`[INFO] Channels: ${health.funded}/${health.total} funded (total: ${health.totalXlm} XLM)`);

    this.logger.info(`[INFO] Network: ${this.config.network}`);
    this.logger.info(`[INFO] Circuit breaker: ${this.config.circuitBreakerEnabled ? 'enabled' : 'disabled'} (hourly: ${this.config.circuitBreakerHourlyLimit}, minute: ${this.config.circuitBreakerMinuteLimit})`);
    this.logger.info('[INFO] Relay ready. Listening on port ' + this.config.port + '.');
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const [stellar, redis, postgresql, cbStatus, channels] = await Promise.all([
      this.checkStellarStatus(),
      this.checkRedisStatus(),
      this.checkPostgresStatus(),
      this.circuitBreaker.getStatus(),
      this.channelManager.getPoolHealth()
    ]);

    const isOk = stellar.reachable && redis.reachable && postgresql.reachable && channels.funded > 0;

    return {
      status: isOk ? 'ok' : 'error',
      checks: {
        stellar,
        redis,
        postgresql,
        channels: {
          fundedCount: channels.funded,
          totalCount: channels.total,
          totalXlm: channels.totalXlm
        },
        circuitBreaker: {
          isOpen: cbStatus.isOpen,
          hourSpent: cbStatus.hourSpent,
          minuteSpent: cbStatus.minuteSpent
        }
      },
      network: this.config.network
    };
  }

  private async checkStellarStatus() {
    try {
      const reachable = await this.stellarClient.checkHealth();
      return { 
        reachable, 
        url: this.config.rpcUrl, 
        clientType: 'rpc',
        error: reachable ? undefined : 'Unreachable'
      };
    } catch (err: unknown) {
      return { 
        reachable: false, 
        url: this.config.rpcUrl, 
        clientType: 'rpc',
        error: getErrorMessage(err) 
      };
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedisStatus() {
    try {
      await this.redis.ping();
      return { reachable: true };
    } catch (err: unknown) {
      return { reachable: false, error: getErrorMessage(err) };
    }
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.db.raw('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkPostgresStatus() {
    try {
      await this.db.raw('SELECT 1');
      return { reachable: true };
    } catch (err: unknown) {
      return { reachable: false, error: getErrorMessage(err) };
    }
  }

  private async retry<T>(fn: () => Promise<T>, retries: number, interval: number): Promise<T | null> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    return null;
  }
}
