import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'res.headers.authorization',
      'password',
      'secret',
      'key',
      'apiKey',
    ],
    remove: true,
  },
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
});
