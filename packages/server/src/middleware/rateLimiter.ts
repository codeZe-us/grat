import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitError } from '../utils/errors';

/**
 * IP-based rate limiting for testnet faucet mode.
 * - 60 requests per minute
 * - 1,000 transactions per day
 */
export const testnetRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  // Only apply on testnet when no API key is provided
  const hasApiKey = req.headers.authorization || req.query.apiKey;
  if (config.network !== 'testnet' || hasApiKey) {
    return next();
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const minuteKey = `ratelimit:min:${ip}`;
  const dayKey = `ratelimit:day:${ip}`;

  try {
    // 1. Minute limit (60 requests)
    const minuteCount = await redis.incr(minuteKey);
    if (minuteCount === 1) {
      await redis.expire(minuteKey, 60);
    }

    if (minuteCount > 60) {
      logger.warn({ msg: 'Minute rate limit exceeded', ip });
      return next(new RateLimitError('Rate limit exceeded. Max 60 requests per minute.', 60));
    }

    // 2. Day limit (1,000 requests) - only for sponsor endpoint
    if (req.path.includes('/sponsor')) {
      const dayCount = await redis.incr(dayKey);
      if (dayCount === 1) {
        await redis.expire(dayKey, 86400);
      }

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
