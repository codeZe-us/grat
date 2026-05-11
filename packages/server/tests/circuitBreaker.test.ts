import { describe, it, expect, beforeEach, vi } from 'vitest';
import { circuitBreaker, CircuitBreakerError } from '../src/utils/circuitBreaker';
import { redis } from '../src/utils/redis';
import { config } from '../src/config';

vi.mock('../src/utils/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    multi: vi.fn().mockReturnValue({
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zincrby: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    ttl: vi.fn(),
    del: vi.fn(),
    zrevrange: vi.fn().mockResolvedValue(['key1', '100', 'key2', '50']),
  }
}));

describe('CircuitBreaker Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as any).circuitBreakerEnabled = true;
    (config as any).circuitBreakerHourlyLimit = '1000';
    (config as any).circuitBreakerMinuteLimit = '100';
  });

  it('allows spending when below limits', async () => {
    (redis.get as any).mockResolvedValue('50');
    await expect(circuitBreaker.check()).resolves.not.toThrow();
  });

  it('trips when hourly limit is exceeded', async () => {
    (redis.get as any)
      .mockResolvedValueOnce('1100')
      .mockResolvedValueOnce('50');
    
    (redis.ttl as any).mockResolvedValue(1800);

    await expect(circuitBreaker.check()).rejects.toThrow(CircuitBreakerError);
    await expect(circuitBreaker.check()).rejects.toMatchObject({
      code: 'RELAY_CIRCUIT_OPEN',
      details: { retryAfter: 1800 }
    });
  });

  it('trips when minute limit is exceeded', async () => {
    (redis.get as any)
      .mockResolvedValueOnce('500')
      .mockResolvedValueOnce('150');
    
    (redis.ttl as any).mockResolvedValue(30);

    await expect(circuitBreaker.check()).rejects.toThrow(CircuitBreakerError);
  });

  it('records spending correctly', async () => {
    await circuitBreaker.record(50n, 'test-key');
    expect(redis.multi).toHaveBeenCalled();
  });

  it('skips checks when disabled', async () => {
    (config as any).circuitBreakerEnabled = false;
    (redis.get as any).mockResolvedValue('50000');
    
    await expect(circuitBreaker.check()).resolves.not.toThrow();
  });
});
