import dotenv from 'dotenv';
import path from 'path';

// Load .env from package root or project root
dotenv.config(); // Load from packages/server/.env if exists
dotenv.config({ path: path.join(process.cwd(), '.env') }); // Load from root if running from root
dotenv.config({ path: path.join(process.cwd(), '../../.env') }); // Load from root if running from package

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  network: process.env.NETWORK || 'testnet',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  channelCount: parseInt(process.env.CHANNEL_COUNT || '10', 10),
  channelSeedPhrase: process.env.CHANNEL_SEED_PHRASE,
  stellarFundingSecret: process.env.STELLAR_FUNDING_SECRET,
  isProduction: process.env.NODE_ENV === 'production',
};
