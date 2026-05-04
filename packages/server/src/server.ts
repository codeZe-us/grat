import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const port = config.port;

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port} in ${config.network} mode`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});
