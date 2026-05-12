import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { RateLimitError, AuthenticationError } from '../utils/errors';
import { KeysService } from '../modules/keys/keys.service';
import { getErrorMessage } from '../utils/error-guards';

export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly keysService: KeysService,
    private readonly config: any,
    private readonly logger: Logger
  ) {}

  handle = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const queryKey = req.query.apiKey as string;
    const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (authHeader || queryKey);

    if (rawKey) {
      try {
        const validatedKey = await this.keysService.validateKey(rawKey);
        if (!validatedKey) {
          return next(new AuthenticationError('Invalid or expired API key'));
        }
        
        if (this.config.network === 'mainnet' && validatedKey.network !== 'mainnet') {
          return next(new AuthenticationError('Testnet API key cannot be used on mainnet relay'));
        }

        (req as any).apiKey = validatedKey;
        return next();
      } catch (err: unknown) {
        this.logger.error({ msg: 'API key validation failed', err: getErrorMessage(err) });
        return next(new AuthenticationError('Authentication failed'));
      }
    }

    if (this.config.network !== 'testnet') {
      return next(new AuthenticationError('API key is required for mainnet'));
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const minuteKey = `ratelimit:min:${ip}`;
    const dayKey = `ratelimit:day:${ip}`;

    try {
      const results = await this.redis.multi()
        .incr(minuteKey)
        .expire(minuteKey, 60, 'NX')
        .incr(dayKey)
        .expire(dayKey, 86400, 'NX')
        .exec();

      if (!results) throw new Error('Redis multi failed');

      const minuteCount = results[0][1] as number;
      if (minuteCount > 60) {
        this.logger.warn({ msg: 'Minute rate limit exceeded', ip });
        return next(new RateLimitError('Rate limit exceeded. Max 60 requests per minute.', 60));
      }

      if (req.path.includes('/sponsor')) {
        const dayCount = results[2][1] as number;
        if (dayCount > 1000) {
          this.logger.warn({ msg: 'Daily sponsorship limit exceeded', ip });
          return next(new RateLimitError('Testnet rate limit reached. Max 1,000 sponsored transactions per day per IP.', 3600));
        }
      }

      next();
    } catch (err: unknown) {
      this.logger.error({ msg: 'Rate limiter error', err: getErrorMessage(err) });
      next();
    }
  };
}
