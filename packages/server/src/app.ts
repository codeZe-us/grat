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


app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as express.Request & { id: string }).id,
    customLogLevel: (res, err) => {
      if (err || (res.statusCode && res.statusCode >= 500)) return 'error';
      if (res.statusCode && res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);


app.use(testnetRateLimiter);


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


app.use(errorHandler);

export { app };
