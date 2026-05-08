import knex, { Knex } from 'knex';
import { config } from '../config';

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
      directory: './dist/database/migrations',
      extension: 'js',
    },
  },
};

const environment = config.isProduction ? 'production' : 'development';
const db = knex(knexConfig[environment]);

export { knexConfig };
export default db;
