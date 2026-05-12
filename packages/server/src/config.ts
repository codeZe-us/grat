import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  network: process.env.NETWORK || 'testnet',
  networkPassphrase: process.env.NETWORK === 'mainnet' 
    ? 'Public Global Stellar Network ; October 2015' 
    : 'Test SDF Network ; September 2015',
  rpcUrl: process.env.RPC_URL || process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  depositAddress: process.env.DEPOSIT_ADDRESS,
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
  depositPollIntervalMs: parseInt(process.env.DEPOSIT_POLL_INTERVAL_MS || '5000', 10),
  feeMultiplier: parseFloat(process.env.FEE_MULTIPLIER || '1.5'),
  txConfirmationTimeoutMs: parseInt(process.env.TX_CONFIRMATION_TIMEOUT_MS || '30000', 10),
  txConfirmationPollIntervalMs: parseInt(process.env.TX_CONFIRMATION_POLL_INTERVAL_MS || '1000', 10),
};

