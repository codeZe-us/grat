import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { requestId } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config';
import { sponsorHandler } from './controllers/sponsorshipController';
import { simulateHandler, estimateHandler } from './controllers/sorobanController';

import { testnetRateLimiter } from './middleware/rateLimiter';

const app: Express = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => ((req as any).id as string),
    customLogLevel: (res, err) => {
      if (err || (res.statusCode && res.statusCode >= 500)) return 'error';
      if (res.statusCode && res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

// Apply rate limiter for testnet faucet mode
app.use(testnetRateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    network: config.network,
    timestamp: new Date().toISOString(),
    requestId: req.id as string,
  });
});


app.post('/v1/sponsor', sponsorHandler);
app.post('/v1/simulate', simulateHandler);
app.post('/v1/estimate', estimateHandler);

// Error handler (must be last)
app.use(errorHandler);

export { app };
