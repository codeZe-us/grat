import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from '../src/utils/circuitBreaker';
import { config } from '../src/config';
import pino from 'pino';

const mockRedis: any = {
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
};

const mockLogger = pino({ level: 'silent' });
const mockConfig = { ...config };

const makeBreaker = () => new CircuitBreaker(mockRedis, mockConfig, mockLogger);

describe('CircuitBreaker Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.circuitBreakerEnabled = true;
    (mockConfig as any).circuitBreakerHourlyLimit = '1000';
    (mockConfig as any).circuitBreakerMinuteLimit = '100';
    // Reset multi mock
    mockRedis.multi.mockReturnValue({
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zincrby: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  });

  it('allows spending when below limits', async () => {
    mockRedis.get.mockResolvedValue('50');
    const breaker = makeBreaker();
    await expect(breaker.check()).resolves.not.toThrow();
  });

  it('trips when hourly limit is exceeded', async () => {
    mockRedis.get
      .mockResolvedValueOnce('1100')
      .mockResolvedValueOnce('50');
    mockRedis.ttl.mockResolvedValue(1800);
    mockRedis.zrevrange.mockResolvedValue(['key1', '1100']);

    const breaker = makeBreaker();
    await expect(breaker.check()).rejects.toThrow(CircuitBreakerError);
  });

  it('trips when minute limit is exceeded', async () => {
    mockRedis.get
      .mockResolvedValueOnce('500')
      .mockResolvedValueOnce('150');
    mockRedis.ttl.mockResolvedValue(30);
    mockRedis.zrevrange.mockResolvedValue(['key1', '150']);

    const breaker = makeBreaker();
    await expect(breaker.check()).rejects.toThrow(CircuitBreakerError);
  });

  it('records spending correctly', async () => {
    const breaker = makeBreaker();
    await breaker.record(50n, 'test-key');
    expect(mockRedis.multi).toHaveBeenCalled();
  });

  it('skips checks when disabled', async () => {
    mockConfig.circuitBreakerEnabled = false;
    mockRedis.get.mockResolvedValue('50000');

    const breaker = makeBreaker();
    await expect(breaker.check()).resolves.not.toThrow();
  });
});
