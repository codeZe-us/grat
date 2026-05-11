import { Horizon, rpc } from '@stellar/stellar-sdk';
import { Redis } from 'ioredis';
import { Knex } from 'knex';
import { Logger } from 'pino';
import { ChannelManager } from '../channels/ChannelManager';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { getErrorMessage } from '../../utils/error-guards';

export interface HealthStatus {
  status: 'ok' | 'error';
  checks: {
    horizon: { reachable: boolean; url: string; error?: string };
    sorobanRpc: { reachable: boolean; url: string; error?: string; optional: boolean };
    redis: { reachable: boolean; error?: string };
    postgresql: { reachable: boolean; error?: string };
    channels: { fundedCount: number; totalCount: number; totalXlm: string };
    circuitBreaker: { isOpen: boolean; hourSpent: string; minuteSpent: string };
  };
  network: string;
}

export class HealthCheckService {
  private sorobanRpc: rpc.Server;

  constructor(
    private readonly horizon: Horizon.Server,
    private readonly redis: Redis,
    private readonly db: Knex,
    private readonly channelManager: ChannelManager,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly config: any,
    private readonly logger: Logger
  ) {
    this.sorobanRpc = new rpc.Server(config.sorobanRpcUrl);
  }

  async runStartupChecks(): Promise<void> {
    this.logger.info('Running startup health checks...');

    const horizonStatus = await this.retry(() => this.checkHorizonStatus(), 3, 2000);
    if (!horizonStatus?.reachable) {
      this.logger.error(`[ERROR] Horizon: ${horizonStatus?.error || 'unreachable'} (${this.config.horizonUrl})`);
      process.exit(1);
    }
    this.logger.info(`[INFO] Horizon: connected (${this.config.horizonUrl})`);

    const sorobanRpcStatus = await this.checkSorobanRpcStatus();
    const sorobanRequired = !!process.env.SOROBAN_RPC_URL;
    if (!sorobanRpcStatus.reachable && sorobanRequired) {
      this.logger.error(`[ERROR] Soroban RPC: ${sorobanRpcStatus.error || 'unreachable'} (${this.config.sorobanRpcUrl})`);
      process.exit(1);
    } else if (!sorobanRpcStatus.reachable) {
      this.logger.warn(`[WARN] Soroban RPC: unreachable (${this.config.sorobanRpcUrl})`);
    } else {
      this.logger.info(`[INFO] Soroban RPC: connected (${this.config.sorobanRpcUrl})`);
    }

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
    const [horizon, sorobanRpc, redis, postgresql, cbStatus, channels] = await Promise.all([
      this.checkHorizonStatus(),
      this.checkSorobanRpcStatus(),
      this.checkRedisStatus(),
      this.checkPostgresStatus(),
      this.circuitBreaker.getStatus(),
      this.channelManager.getPoolHealth()
    ]);

    const isOk = horizon.reachable && (sorobanRpc.reachable || sorobanRpc.optional) && redis.reachable && postgresql.reachable && channels.funded > 0;

    return {
      status: isOk ? 'ok' : 'error',
      checks: {
        horizon,
        sorobanRpc,
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

  private async checkHorizon(): Promise<boolean> {
    try {
      await this.horizon.root();
      return true;
    } catch {
      return false;
    }
  }

  private async checkHorizonStatus() {
    try {
      await this.horizon.root();
      return { reachable: true, url: this.config.horizonUrl };
    } catch (err: unknown) {
      return { reachable: false, url: this.config.horizonUrl, error: getErrorMessage(err) };
    }
  }

  private async checkSorobanRpc(): Promise<boolean> {
    try {
      const health = await this.sorobanRpc.getHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }

  private async checkSorobanRpcStatus() {
    const optional = !process.env.SOROBAN_RPC_URL;
    try {
      const health = await this.sorobanRpc.getHealth();
      return { reachable: health.status === 'healthy', url: this.config.sorobanRpcUrl, optional };
    } catch (err: unknown) {
      return { reachable: false, url: this.config.sorobanRpcUrl, error: getErrorMessage(err), optional };
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
