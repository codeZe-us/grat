import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { requestId } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config';
import { sponsorHandler } from './controllers/sponsorshipController';

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    network: config.network,
    timestamp: new Date().toISOString(),
    requestId: req.id,
  });
});

// Route stubs
const notImplemented = (req: express.Request, res: express.Response) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'This endpoint is not implemented yet',
      requestId: req.id,
    },
  });
};

app.post('/v1/sponsor', sponsorHandler);
app.post('/v1/simulate', notImplemented);
app.post('/v1/estimate', notImplemented);

// Error handler (must be last)
app.use(errorHandler);

export { app };
