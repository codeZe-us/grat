import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  network: process.env.NETWORK || 'testnet',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:000000@localhost:5433/grat?sslmode=disable',
  databasePoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
  channelCount: parseInt(process.env.CHANNEL_COUNT || '10', 10),
  channelSeedPhrase: process.env.CHANNEL_SEED_PHRASE,
  stellarFundingSecret: process.env.STELLAR_FUNDING_SECRET,
  isProduction: process.env.NODE_ENV === 'production',
  adminToken: process.env.ADMIN_TOKEN || 'dev-admin-token',
  maxSponsorFeeStroops: process.env.MAX_SPONSOR_FEE_STROOPS || '5000000',
  circuitBreakerHourlyLimit: process.env.CIRCUIT_BREAKER_HOURLY_LIMIT || '50000000000',
  circuitBreakerMinuteLimit: process.env.CIRCUIT_BREAKER_MINUTE_LIMIT || '5000000000',
  circuitBreakerEnabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
};
