import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitError, AuthenticationError } from '../utils/errors';
import { keysService } from '../modules/keys/keys.service';

/**
 * IP-based rate limiting for testnet faucet mode.
 * - 60 requests per minute
 * - 1,000 transactions per day
 */
export const testnetRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const queryKey = req.query.apiKey as string;
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (authHeader || queryKey);

  // If API key is provided, validate it
  if (rawKey) {
    try {
      const validatedKey = await keysService.validateKey(rawKey);
      if (!validatedKey) {
        return next(new AuthenticationError('Invalid or expired API key'));
      }
      
      // Check network compatibility
      if (config.network === 'mainnet' && validatedKey.network !== 'mainnet') {
        return next(new AuthenticationError('Testnet API key cannot be used on mainnet relay'));
      }

      // Attach key info to request for later use (e.g. credit checks)
      (req as any).apiKey = validatedKey;
      return next();
    } catch (err) {
      logger.error({ msg: 'API key validation failed', err });
      return next(new AuthenticationError('Authentication failed'));
    }
  }

  // Fallback to testnet IP-based rate limiting
  if (config.network !== 'testnet') {
    return next(new AuthenticationError('API key is required for mainnet'));
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const minuteKey = `ratelimit:min:${ip}`;
  const dayKey = `ratelimit:day:${ip}`;

  try {
    // 1. Minute limit (60 requests)
    // Atomic increment and expire using Lua-like behavior via multi/pipeline or single command
    // Actually, we can use a single EVAL but simple INCR + EXPIRE with a check is often enough if we use a pipeline
    // However, the cleanest way in ioredis is to use a pipeline or a custom command.
    // For simplicity and correctness, we'll use a transaction.
    
    const [minuteResult, dayResult] = await redis.multi()
      .incr(minuteKey)
      .expire(minuteKey, 60, 'NX')
      .incr(dayKey)
      .expire(dayKey, 86400, 'NX')
      .exec() as any;

    const minuteCount = minuteResult[1];
    if (minuteCount > 60) {
      logger.warn({ msg: 'Minute rate limit exceeded', ip });
      return next(new RateLimitError('Rate limit exceeded. Max 60 requests per minute.', 60));
    }

    // 2. Day limit (1,000 requests) - only for sponsor endpoint
    if (req.path.includes('/sponsor')) {
      const dayCount = dayResult[1];
      if (dayCount > 1000) {
        logger.warn({ msg: 'Daily sponsorship limit exceeded', ip });
        return next(new RateLimitError('Testnet rate limit reached. Max 1,000 sponsored transactions per day per IP.', 3600));
      }
    }

    next();
  } catch (err) {
    logger.error({ msg: 'Rate limiter error', err });
    // Fail open to avoid blocking users if Redis is down, but log it
    next();
  }
};
