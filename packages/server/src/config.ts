import dotenv from 'dotenv';
import path from 'path';

// Load .env from root if it exists
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  network: process.env.NETWORK || 'testnet',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  channelCount: parseInt(process.env.CHANNEL_COUNT || '10', 10),
  stellarFundingSecret: process.env.STELLAR_FUNDING_SECRET,
  isProduction: process.env.NODE_ENV === 'production',
};
