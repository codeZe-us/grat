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
import keysRoutes from './modules/keys/keys.routes';
import { container } from './container';
import { adminAuth } from './middleware/auth';
import * as adminController from './controllers/adminController';
import { getErrorMessage } from './utils/error-guards';

const app: Express = express();


app.use(helmet());
app.use(cors({
  origin: config.isProduction 
    ? [/\.grat\.network$/, /^http:\/\/localhost:\d+$/] 
    : true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-SDK-Version'],
  exposedHeaders: ['Retry-After'],
}));
app.use(express.json({ limit: '1mb' }));
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


app.use(container.rateLimiter.handle);


app.get('/health', async (req, res) => {
  try {
    const health = await container.healthCheckService.getHealthStatus();
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json({
      ...health,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      requestId: req.id as string,
    });
  } catch (err: unknown) {
    logger.error({ msg: 'Health check failed', err: getErrorMessage(err) });
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.id as string,
    });
  }
});


app.use('/v1/keys', keysRoutes);
app.post('/v1/sponsor', sponsorHandler);
app.post('/v1/simulate', simulateHandler);
app.post('/v1/estimate', estimateHandler);
app.get('/v1/circuit-breaker/status', adminAuth, adminController.getCircuitBreakerStatus);
app.post('/v1/circuit-breaker/reset', adminAuth, adminController.resetCircuitBreaker);


app.use(errorHandler);

export { app };
