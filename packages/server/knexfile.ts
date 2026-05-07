import type { Knex } from 'knex';
import { config } from './src/config';

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: config.databaseUrl,
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts',
    },
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: config.databasePoolSize,
    },
    migrations: {
      directory: './src/database/migrations',
      extension: 'js',
    },
  },
};

export default knexConfig;
