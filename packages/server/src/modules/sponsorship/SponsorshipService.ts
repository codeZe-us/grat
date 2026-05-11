import {
  TransactionBuilder,
  Networks,
  Transaction,
  rpc,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { ChannelManager } from '../channels/ChannelManager';
import { SequenceManager } from '../channels/SequenceManager';
import { CreditService } from './CreditService';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { TransactionLogger } from './TransactionLogger';
import {
  ValidationError,
  ChannelExhaustedError,
  SubmissionFailedError,
  FrozenEntryError,
} from '../../utils/errors';
import { 
  getErrorMessage, 
  isStellarSubmissionError, 
  isRelayError 
} from '../../utils/error-guards';
import { StellarClient } from '../../stellar/stellar-client';

export interface SponsorRequest {
  transaction: string;
  network?: string;
}

export interface SponsorResponse {
  hash: string;
  ledger: number;
  feePaid: string;
  network: string;
  channelAccount: string;
}

export class SponsorshipService {
  constructor(
    private readonly stellarClient: StellarClient,
    private readonly channelManager: ChannelManager,
    private readonly sequenceManager: SequenceManager,
    private readonly creditService: CreditService,
    private readonly transactionLogger: TransactionLogger,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly redis: Redis,
    private readonly config: any,
    private readonly logger: Logger
  ) {}

  async sponsor(request: SponsorRequest, requestId: string): Promise<SponsorResponse> {
    this.logger.info({ requestId, network: request.network }, 'Sponsorship request received');

    if (!request.transaction) {
      throw new ValidationError('Transaction XDR is required');
    }

    let tx: Transaction | FeeBumpTransaction;
    try {
      tx = TransactionBuilder.fromXDR(request.transaction, request.network || Networks.TESTNET);
    } catch (err) {
      throw new ValidationError('Invalid transaction XDR');
    }

    if (tx instanceof FeeBumpTransaction) {
      throw new ValidationError('Transaction is already fee-bumped');
    }

    const innerTx = tx as Transaction;
    this.validateTransaction(innerTx);
    await this.circuitBreaker.check();

    const estimation = await this.estimate(request);
    const heldAmount = BigInt(estimation.estimatedFee);
    const apiKeyId = (request as any).apiKeyId;
    
    if (apiKeyId) {
      await this.creditService.placeHold(apiKeyId, heldAmount);
    } else if (this.config.network !== 'testnet') {
      throw new ValidationError('API key is required for mainnet sponsorship');
    }

    let channel: any = null;
    try {
      channel = await this.channelManager.acquire();
      if (!channel) {
        throw new ChannelExhaustedError();
      }

      const feeBumpTx = await this.buildFeeBump(innerTx, channel);

      this.logger.info({ requestId, hash: innerTx.hash().toString('hex'), channel: channel.publicKey }, 'Submitting sponsored transaction');
      const result = await this.stellarClient.submitTransaction(feeBumpTx);

      if (result.status === 'SUCCESS') {
        const actualFee = BigInt(result.feePaid || '0');
        const response: SponsorResponse = {
          hash: result.hash,
          ledger: result.ledger || 0,
          feePaid: actualFee.toString(),
          network: request.network || 'testnet',
          channelAccount: channel.publicKey,
        };

        await this.transactionLogger.log({
          apiKeyId,
          transactionHash: result.hash,
          channelAccount: channel.publicKey,
          innerSourceAccount: innerTx.source,
          feePaidStroops: response.feePaid,
          network: response.network,
          operationsCount: innerTx.operations.length,
          isSoroban: innerTx.operations.some(op => op.type === 'invokeHostFunction'),
          status: 'success',
        });

        if (apiKeyId) {
          await this.creditService.confirmDeduction(apiKeyId, heldAmount, actualFee);
        }
        
        return response;
      } else {
        throw new SubmissionFailedError(result.errorMessage || 'Unknown submission error', result.errorCode);
      }
    } catch (err: any) {
      this.logger.error({ err: getErrorMessage(err), requestId }, 'Sponsorship failed');
      if (apiKeyId) {
        await this.creditService.releaseHold(apiKeyId, heldAmount);
      }

      if (innerTx) {
        await this.transactionLogger.log({
          apiKeyId,
          transactionHash: innerTx.hash().toString('hex'),
          channelAccount: channel?.publicKey || 'none',
          innerSourceAccount: innerTx.source,
          feePaidStroops: '0',
          network: request.network || 'testnet',
          operationsCount: innerTx.operations.length,
          isSoroban: innerTx.operations.some(op => op.type === 'invokeHostFunction'),
          status: 'failed',
          errorMessage: getErrorMessage(err),
        });
      }

      if (isStellarSubmissionError(err)) {
        if (getErrorMessage(err).includes('FROZEN_ENTRY')) {
          throw new FrozenEntryError();
        }
      }

      if (isRelayError(err)) throw err;
      throw new SubmissionFailedError(getErrorMessage(err));
    } finally {
      if (channel) {
        await this.channelManager.release(channel.publicKey);
      }
    }
  }

  async simulate(request: SponsorRequest): Promise<any> {
    const tx = TransactionBuilder.fromXDR(request.transaction, request.network || Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw new ValidationError('Only classic transactions can be simulated');
    
    return this.stellarClient.simulateTransaction(tx);
  }

  async estimate(request: SponsorRequest): Promise<any> {
    const tx = TransactionBuilder.fromXDR(request.transaction, request.network || Networks.TESTNET);
    if (!(tx instanceof Transaction)) throw new ValidationError('Only classic transactions can be estimated');

    const feeStats = await this.stellarClient.estimateFee(tx);
    const isSoroban = tx.operations.some(op => op.type === 'invokeHostFunction');
    
    let resourceFee = '0';
    if (isSoroban) {
      const sim = await this.stellarClient.simulateTransaction(tx);
      resourceFee = sim.resourceFee;
    }

    const estimatedFee = (BigInt(feeStats.recommendedFee) + BigInt(resourceFee)).toString();

    return {
      estimatedFee,
      breakdown: {
        inclusionFee: feeStats.recommendedFee,
        resourceFee,
        baseFee: feeStats.baseFee,
      }
    };
  }

  private validateTransaction(tx: Transaction) {
    if (this.channelManager.isChannelAccount(tx.source)) {
      throw new ValidationError('Channel accounts cannot be used as inner transaction sources');
    }

    for (const op of tx.operations) {
      if (op.type === 'accountMerge' && this.channelManager.isChannelAccount(op.destination)) {
        throw new ValidationError('Channel accounts cannot be merged into other accounts');
      }
    }

    if (tx.signatures.length === 0) {
      throw new ValidationError('Transaction must be signed by the source account');
    }
  }

  private async buildFeeBump(tx: Transaction, channel: any): Promise<FeeBumpTransaction> {
    const feeStats = await this.stellarClient.estimateFee(tx);
    const isSoroban = tx.operations.some(op => op.type === 'invokeHostFunction');
    
    let resourceFee = '0';
    if (isSoroban) {
      const sim = await this.stellarClient.simulateTransaction(tx);
      resourceFee = sim.resourceFee;
    }

    const fee = (BigInt(feeStats.recommendedFee) + BigInt(resourceFee)).toString();

    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
      channel.keypair,
      fee,
      tx,
      this.config.networkPassphrase
    );
    feeBumpTx.sign(channel.keypair);
    return feeBumpTx;
  }

  async checkIdempotency(key: string, apiKeyId?: string): Promise<SponsorResponse | null> {
    const redisKey = apiKeyId ? `idempotency:${apiKeyId}:${key}` : `idempotency:anon:${key}`;
    const cached = await this.redis.get(redisKey);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  async setIdempotency(key: string, result: SponsorResponse, apiKeyId?: string): Promise<void> {
    const redisKey = apiKeyId ? `idempotency:${apiKeyId}:${key}` : `idempotency:anon:${key}`;
    await this.redis.set(redisKey, JSON.stringify(result), 'EX', 3600); // Cache for 1 hour
  }
}
