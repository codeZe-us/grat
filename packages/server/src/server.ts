import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { channelManager } from './modules/channels/ChannelManager';

const port = config.port;

const start = async () => {
  try {
    await channelManager.initialize();
    
    const server = app.listen(port, '127.0.0.1', () => {
      logger.info(`Server listening on http://127.0.0.1:${port} in ${config.network} mode`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} signal received: closing HTTP server`);
      channelManager.stop();
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ msg: 'Failed to start server', err });
    process.exit(1);
  }
};

start();
