import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { channelManager } from './modules/channels/ChannelManager';
import { initializeDatabase, closeDatabase } from './database/db';

const port = config.port;

const start = async () => {
  try {
    await initializeDatabase();
    
    await channelManager.initialize();
    
    const server = app.listen(port, () => {
      logger.info(`Server listening on port ${port} in ${config.network} mode`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} signal received: closing HTTP server`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          channelManager.stop();
          await closeDatabase();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (err) {
          logger.error({ msg: 'Error during shutdown', err });
          process.exit(1);
        }
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
