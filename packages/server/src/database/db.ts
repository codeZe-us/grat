import { Pool, PoolConfig } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  connectionString: config.databaseUrl,
  max: config.databasePoolSize,
};

if (config.isProduction) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

export const pool = new Pool(poolConfig);

export const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    logger.info('Database connection established successfully');
    
    await client.query('SELECT 1');
    client.release();
    
    return true;
  } catch (err) {
    logger.error({ msg: 'Failed to connect to the database', err, url: config.databaseUrl });
    process.exit(1);
  }
};


export const closeDatabase = async () => {
  logger.info('Draining database connection pool...');
  await pool.end();
  logger.info('Database connection pool drained');
};
