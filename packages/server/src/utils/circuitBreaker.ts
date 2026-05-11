import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { RelayError } from './errors';
import { getErrorMessage } from './error-guards';

export class CircuitBreakerError extends RelayError {
  constructor(message: string, retryAfter: number) {
    super(message, 'RELAY_CIRCUIT_OPEN', 503, { retryAfter });
  }
}

export class CircuitBreaker {
  private static readonly HOURLY_KEY = 'circuit:spending:hour';
  private static readonly MINUTE_KEY = 'circuit:spending:minute';
  private static readonly TRACKING_KEY = 'circuit:spending:keys';

  constructor(
    private readonly redis: Redis,
    private readonly config: any,
    private readonly logger: Logger
  ) {}

  async check() {
    if (!this.config.circuitBreakerEnabled) return;

    try {
      const [hourVal, minuteVal] = await Promise.all([
        this.redis.get(CircuitBreaker.HOURLY_KEY),
        this.redis.get(CircuitBreaker.MINUTE_KEY),
      ]);

      const hourSpent = BigInt(hourVal || '0');
      const minuteSpent = BigInt(minuteVal || '0');

      const hourlyLimit = BigInt(this.config.circuitBreakerHourlyLimit);
      const minuteLimit = BigInt(this.config.circuitBreakerMinuteLimit);

      if (hourSpent >= hourlyLimit) {
        await this.trip('hourly', hourSpent, hourlyLimit);
      }

      if (minuteSpent >= minuteLimit) {
        await this.trip('minute', minuteSpent, minuteLimit);
      }
    } catch (err: unknown) {
      if (err instanceof CircuitBreakerError) throw err;
      this.logger.error({ msg: 'Redis error in circuit breaker check', err: getErrorMessage(err) });
    }
  }

  private async trip(window: string, spent: bigint, limit: bigint) {
    const ttl = window === 'hourly' 
      ? await this.redis.ttl(CircuitBreaker.HOURLY_KEY) 
      : await this.redis.ttl(CircuitBreaker.MINUTE_KEY);

    const topKeys = await this.redis.zrevrange(CircuitBreaker.TRACKING_KEY, 0, 4, 'WITHSCORES');
    
    this.logger.error({
      msg: 'CIRCUIT BREAKER TRIPPED',
      window,
      spent: spent.toString(),
      limit: limit.toString(),
      topKeys,
    });

    throw new CircuitBreakerError(
      'Relay has temporarily stopped sponsoring transactions due to abnormal spending patterns. This is a safety mechanism. Contact the relay operator.',
      ttl > 0 ? ttl : (window === 'hourly' ? 3600 : 60)
    );
  }

  async record(amountStroops: bigint, apiKeyPrefix: string) {
    if (!this.config.circuitBreakerEnabled) return;

    try {
      const amount = amountStroops.toString();
      
      await this.redis.multi()
        .incrby(CircuitBreaker.HOURLY_KEY, amount)
        .expire(CircuitBreaker.HOURLY_KEY, 3600, 'NX')
        .incrby(CircuitBreaker.MINUTE_KEY, amount)
        .expire(CircuitBreaker.MINUTE_KEY, 60, 'NX')
        .zincrby(CircuitBreaker.TRACKING_KEY, amount, apiKeyPrefix)
        .expire(CircuitBreaker.TRACKING_KEY, 3600, 'NX')
        .exec();
    } catch (err: unknown) {
      this.logger.error({ msg: 'Redis error in circuit breaker record', err: getErrorMessage(err) });
    }
  }

  async getStatus() {
    const [hourVal, minuteVal] = await Promise.all([
      this.redis.get(CircuitBreaker.HOURLY_KEY),
      this.redis.get(CircuitBreaker.MINUTE_KEY),
    ]);

    const hourSpent = BigInt(hourVal || '0');
    const minuteSpent = BigInt(minuteVal || '0');

    return {
      hourSpent: hourSpent.toString(),
      minuteSpent: minuteSpent.toString(),
      hourLimit: this.config.circuitBreakerHourlyLimit,
      minuteLimit: this.config.circuitBreakerMinuteLimit,
      isOpen: hourSpent >= BigInt(this.config.circuitBreakerHourlyLimit) || minuteSpent >= BigInt(this.config.circuitBreakerMinuteLimit),
    };
  }

  async reset() {
    await this.redis.del(CircuitBreaker.HOURLY_KEY, CircuitBreaker.MINUTE_KEY, CircuitBreaker.TRACKING_KEY);
    this.logger.info('Circuit breaker manually reset');
  }
}
