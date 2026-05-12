import { config } from './config';
import { logger } from './utils/logger';
import { redis } from './utils/redis';
import db from './database/knex';
import { ChannelManager } from './modules/channels/ChannelManager';
import { SequenceManager } from './modules/channels/SequenceManager';
import { CreditService } from './modules/sponsorship/CreditService';
import { CircuitBreaker } from './utils/circuitBreaker';
import { TransactionLogger } from './modules/sponsorship/TransactionLogger';
import { SponsorshipService } from './modules/sponsorship/SponsorshipService';
import { KeysService } from './modules/keys/keys.service';
import { RateLimiter } from './middleware/rateLimiter';
import { HealthCheckService } from './modules/health/HealthCheckService';
import { StellarClient } from './stellar/stellar-client';
import { RpcClient } from './stellar/rpc-client';
import { DepositPoller } from './workers/deposit-poller';

export function createContainer() {
  const stellarClient: StellarClient = new RpcClient(config.rpcUrl, config.networkPassphrase, config, logger);
  
  const sequenceManager = new SequenceManager(redis, stellarClient, logger);
  const channelManager = new ChannelManager(redis, stellarClient, sequenceManager, config, logger);
  const creditService = new CreditService(db, redis, logger);
  const circuitBreaker = new CircuitBreaker(redis, config, logger);
  const transactionLogger = new TransactionLogger(db, logger);
  const keysService = new KeysService(db, logger);
  
  const depositPoller = new DepositPoller(stellarClient, db, redis, config, logger);
  
  const healthCheckService = new HealthCheckService(
    stellarClient,
    redis,
    db,
    channelManager,
    circuitBreaker,
    config,
    logger
  );

  const sponsorshipService = new SponsorshipService(
    stellarClient,
    channelManager,
    sequenceManager,
    creditService,
    transactionLogger,
    circuitBreaker,
    redis,
    config,
    logger
  );

  const rateLimiter = new RateLimiter(redis, keysService, config, logger);

  return {
    sponsorshipService,
    channelManager,
    creditService,
    circuitBreaker,
    keysService,
    rateLimiter,
    healthCheckService,
    depositPoller,
    stellarClient,
    db,
    redis,
    logger
  };
}

export const container = createContainer();
