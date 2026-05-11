import { redis } from './redis';
import { config } from '../config';
import { logger } from './logger';
import { RelayError } from './errors';

export class CircuitBreakerError extends RelayError {
  constructor(message: string, retryAfter: number) {
    super(message, 'RELAY_CIRCUIT_OPEN', 503, { retryAfter });
  }
}

export class CircuitBreaker {
  private static readonly HOURLY_KEY = 'circuit:spending:hour';
  private static readonly MINUTE_KEY = 'circuit:spending:minute';
  private static readonly TRACKING_KEY = 'circuit:spending:keys'; // For top 5 API keys

  async check() {
    if (!config.circuitBreakerEnabled) return;

    const [hourVal, minuteVal] = await Promise.all([
      redis.get(CircuitBreaker.HOURLY_KEY),
      redis.get(CircuitBreaker.MINUTE_KEY),
    ]);

    const hourSpent = BigInt(hourVal || '0');
    const minuteSpent = BigInt(minuteVal || '0');

    const hourlyLimit = BigInt(config.circuitBreakerHourlyLimit);
    const minuteLimit = BigInt(config.circuitBreakerMinuteLimit);

    if (hourSpent >= hourlyLimit) {
      await this.trip('hourly', hourSpent, hourlyLimit);
    }

    if (minuteSpent >= minuteLimit) {
      await this.trip('minute', minuteSpent, minuteLimit);
    }
  }

  private async trip(window: string, spent: bigint, limit: bigint) {
    const ttl = window === 'hourly' 
      ? await redis.ttl(CircuitBreaker.HOURLY_KEY) 
      : await redis.ttl(CircuitBreaker.MINUTE_KEY);

    const topKeys = await redis.zrevrange(CircuitBreaker.TRACKING_KEY, 0, 4, 'WITHSCORES');
    
    logger.error({
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
    if (!config.circuitBreakerEnabled) return;

    const amount = amountStroops.toString();
    
    await redis.multi()
      .incrby(CircuitBreaker.HOURLY_KEY, amount)
      .expire(CircuitBreaker.HOURLY_KEY, 3600, 'NX')
      .incrby(CircuitBreaker.MINUTE_KEY, amount)
      .expire(CircuitBreaker.MINUTE_KEY, 60, 'NX')
      .zincrby(CircuitBreaker.TRACKING_KEY, amount, apiKeyPrefix)
      .expire(CircuitBreaker.TRACKING_KEY, 3600, 'NX')
      .exec();
  }

  async getStatus() {
    const [hourVal, minuteVal] = await Promise.all([
      redis.get(CircuitBreaker.HOURLY_KEY),
      redis.get(CircuitBreaker.MINUTE_KEY),
    ]);

    const hourSpent = BigInt(hourVal || '0');
    const minuteSpent = BigInt(minuteVal || '0');

    return {
      hourSpent: hourSpent.toString(),
      minuteSpent: minuteSpent.toString(),
      hourLimit: config.circuitBreakerHourlyLimit,
      minuteLimit: config.circuitBreakerMinuteLimit,
      isOpen: hourSpent >= BigInt(config.circuitBreakerHourlyLimit) || minuteSpent >= BigInt(config.circuitBreakerMinuteLimit),
    };
  }

  async reset() {
    await redis.del(CircuitBreaker.HOURLY_KEY, CircuitBreaker.MINUTE_KEY, CircuitBreaker.TRACKING_KEY);
    logger.info('Circuit breaker manually reset');
  }
}

export const circuitBreaker = new CircuitBreaker();
