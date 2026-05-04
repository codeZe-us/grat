import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  logger.error({ msg: 'Redis error', err });
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});
