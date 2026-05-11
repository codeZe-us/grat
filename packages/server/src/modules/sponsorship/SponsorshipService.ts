import {
  TransactionBuilder,
  Networks,
  Horizon,
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
  SimulationFailedError,
  SubmissionFailedError,
  FrozenEntryError,
  RelayError,
} from '../../utils/errors';
import { 
  getErrorMessage, 
  isStellarHorizonError, 
  isRelayError 
} from '../../utils/error-guards';

export interface SponsorRequest {
  transaction: string;
  network?: string;
  idempotencyKey?: string;
}

export interface SponsorResponse {
  hash: string;
  ledger: number;
  feePaid: string;
  network: string;
  channelAccount: string;
}

export interface SimulationResult {
  resourceFee: string;
  latestLedger: number;
  transactionData: string;
  auth: unknown[];
  events: unknown[];
}

export interface EstimateResponse {
  estimatedFee: string;
  breakdown: {
    baseFee: string;
    resourceFee: string;
  };
  network: string;
  note: string;
}

export interface CreditHold {
  confirm(actualFee: bigint): Promise<void>;
  release(): Promise<void>;
}

export class SponsorshipService {
  private rpc: rpc.Server;

  constructor(
    private readonly horizon: Horizon.Server,
    private readonly channelManager: ChannelManager,
    private readonly sequenceManager: SequenceManager,
    private readonly creditService: CreditService,
    private readonly transactionLogger: TransactionLogger,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly redis: Redis,
    private readonly config: any,
    private readonly logger: Logger
  ) {
    this.rpc = new rpc.Server(config.sorobanRpcUrl);
  }

  async sponsor(req: SponsorRequest, requestId: string): Promise<SponsorResponse> {
    try {
      // 1. Validate
      const transaction = this.validateTransaction(req.transaction, req.network);

      // 2. Estimate Fee
      const estimatedFee = await this.estimateFee(transaction);

      // 3. Safety Check
      await this.circuitBreaker.check();

      // 4. Reserve Credits
      const apiKey = (req as any).apiKey;
      const creditHold = await this.reserveCredits(apiKey?.id, estimatedFee);

      try {
        // 5. Submit
        const result = await this.acquireChannelAndSubmit(transaction, estimatedFee, requestId);

        // 6. Finalize
        return await this.finalizeTransaction(apiKey?.id, creditHold, result, transaction);
      } catch (err: unknown) {
        await creditHold.release();
        throw err;
      }
    } catch (err: any) {
      if (isRelayError(err)) throw err;
      
      const errorMsg = getErrorMessage(err);
      const errorDetails = err.response?.data?.extras?.result_codes || err.response?.data || {};
      
      this.logger.error({ 
        requestId, 
        err: errorMsg,
        details: errorDetails
      }, 'Unexpected error in sponsor flow');
      
      throw new RelayError('Transaction submission failed: ' + errorMsg, 'SUBMISSION_FAILED', 502, errorDetails);
    }
  }

  private validateTransaction(xdr: string, network?: string): Transaction {
    const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    
    let tx: Transaction;
    try {
      const txEnvelope = TransactionBuilder.fromXDR(xdr, networkPassphrase);
      if (!(txEnvelope instanceof Transaction)) {
        throw new ValidationError('Fee-bump transactions cannot be sponsored');
      }
      tx = txEnvelope;
    } catch (err: unknown) {
      throw new ValidationError(getErrorMessage(err));
    }

    if (tx.signatures.length === 0) {
      throw new ValidationError('Transaction must be signed by the source account');
    }

    if (this.channelManager.isChannelAccount(tx.source)) {
      throw new ValidationError('Channel accounts cannot be used as inner transaction sources');
    }

    for (const op of tx.operations) {
      if (op.source && this.channelManager.isChannelAccount(op.source)) {
        throw new ValidationError('Channel accounts cannot be used as operation source accounts');
      }
      if (op.type === 'accountMerge' && this.channelManager.isChannelAccount(op.destination)) {
        throw new ValidationError('Channel accounts cannot be merged into other accounts');
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const maxAllowedTime = now + 600; 
    
    if (!tx.timeBounds) {
      throw new ValidationError('Transaction must have time bounds set');
    }

    const maxTime = parseInt(tx.timeBounds.maxTime);
    if (maxTime === 0 || maxTime > maxAllowedTime) {
      throw new ValidationError('Transaction expiration (maxTime) is too far in the future or infinite');
    }

    return tx;
  }

  private async estimateFee(transaction: Transaction): Promise<bigint> {
    try {
      const feeStats = await this.horizon.feeStats();
      const baseFee = feeStats.fee_charged.p70 || '100';

      const innerFee = BigInt(transaction.fee);
      const numOps = BigInt(transaction.operations.length);
      const estimatedFee = innerFee + (numOps + 1n) * BigInt(baseFee);

      if (estimatedFee > BigInt(this.config.maxSponsorFeeStroops)) {
        throw new ValidationError(`Transaction fee (${estimatedFee} stroops) exceeds maximum allowed (${this.config.maxSponsorFeeStroops} stroops)`);
      }

      return estimatedFee;
    } catch (err: unknown) {
      if (isRelayError(err)) throw err;
      throw new SubmissionFailedError(`Fee estimation failed: ${getErrorMessage(err)}`);
    }
  }

  private async reserveCredits(apiKeyId: string | undefined, estimatedFee: bigint): Promise<CreditHold> {
    if (!apiKeyId || this.config.network !== 'mainnet') {
      return { confirm: async () => {}, release: async () => {} };
    }

    await this.creditService.placeHold(apiKeyId, estimatedFee);

    return {
      confirm: (actual) => this.creditService.confirmDeduction(apiKeyId, estimatedFee, actual),
      release: () => this.creditService.releaseHold(apiKeyId, estimatedFee)
    };
  }

  private async acquireChannelAndSubmit(
    transaction: Transaction, 
    estimatedFee: bigint, 
    requestId: string
  ): Promise<{ hash: string; ledger: number; feePaid: string; channelPublicKey: string }> {
    let retries = 0;
    const maxRetries = 3;
    const networkPassphrase = this.config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    while (retries <= maxRetries) {
      const channel = await this.channelManager.acquire();
      if (!channel) throw new ChannelExhaustedError();

      try {
        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          channel.publicKey,
          estimatedFee.toString(),
          transaction,
          networkPassphrase
        );

        feeBump.sign(channel.keypair);

        const result = await Promise.race([
          this.horizon.submitTransaction(feeBump),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Horizon submission timeout')), 25000))
        ]) as any;

        return {
          hash: result.hash,
          ledger: result.ledger,
          feePaid: feeBump.fee,
          channelPublicKey: channel.publicKey
        };

      } catch (err: unknown) {
        if (isStellarHorizonError(err)) {
          const resultCodes = err.response?.data?.extras?.result_codes;
          
          if (resultCodes?.transaction === 'tx_frozen' || resultCodes?.inner_transaction?.transaction === 'tx_frozen') {
            const frozenKeys = (err as any).response?.data?.extras?.frozen_keys || [];
            throw new FrozenEntryError(undefined, frozenKeys);
          }

          if (resultCodes?.transaction === 'tx_bad_seq' || (err as any).response?.status === 503) {
            if (resultCodes?.transaction === 'tx_bad_seq') {
              await this.sequenceManager.sync(channel.publicKey);
            }
            if (retries < maxRetries) {
              retries++;
              await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
              continue;
            }
          }
        }

        if (getErrorMessage(err) === 'Horizon submission timeout' && retries < maxRetries) {
          retries++;
          continue;
        }

        throw err;
      } finally {
        await this.channelManager.release(channel.publicKey);
      }
    }

    throw new SubmissionFailedError('Max retries exceeded during submission');
  }

  private async finalizeTransaction(
    apiKeyId: string | undefined,
    creditHold: CreditHold,
    result: { hash: string; ledger: number; feePaid: string; channelPublicKey: string },
    innerTx: Transaction
  ): Promise<SponsorResponse> {
    const feePaid = BigInt(result.feePaid);
    
    // 1. Confirm Credits
    await creditHold.confirm(feePaid);

    // 2. Record in Circuit Breaker
    const apiKeyPrefix = (apiKeyId ? 'api-key' : 'anonymous'); // Ideally we'd have the prefix here
    await this.circuitBreaker.record(feePaid, apiKeyPrefix);

    // 3. Log to DB
    await this.transactionLogger.log({
      apiKeyId,
      transactionHash: result.hash,
      channelAccount: result.channelPublicKey,
      innerSourceAccount: innerTx.source,
      feePaidStroops: result.feePaid,
      network: this.config.network,
      operationsCount: innerTx.operations.length,
      isSoroban: this.isSorobanTransaction(innerTx),
      status: 'success'
    });

    return {
      hash: result.hash,
      ledger: result.ledger,
      feePaid: result.feePaid,
      network: this.config.network,
      channelAccount: result.channelPublicKey,
    };
  }

  private isSorobanTransaction(tx: Transaction): boolean {
    return tx.operations.some(op => 
      op.type === 'invokeHostFunction' || 
      op.type === 'extendFootprintTtl' || 
      op.type === 'restoreFootprint'
    );
  }

  async checkIdempotency(key: string, apiKeyId?: string): Promise<SponsorResponse | null> {
    const scope = apiKeyId || 'public';
    try {
      const cached = await this.redis.get(`idempotency:${scope}:${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (err: unknown) {
      this.logger.error({ msg: 'Redis error in checkIdempotency', err: getErrorMessage(err) });
      return null;
    }
  }

  async setIdempotency(key: string, result: SponsorResponse, apiKeyId?: string) {
    const scope = apiKeyId || 'public';
    try {
      await this.redis.set(`idempotency:${scope}:${key}`, JSON.stringify(result), 'EX', 86400);
    } catch (err: unknown) {
      this.logger.error({ msg: 'Redis error in setIdempotency', err: getErrorMessage(err) });
    }
  }

  async simulate(xdr: string): Promise<SimulationResult> {
    try {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      if (!this.isSorobanTransaction(tx)) {
        return { resourceFee: '0', latestLedger: 0, transactionData: xdr, auth: [], events: [] };
      }

      const result = await this.rpc.simulateTransaction(tx);

      if (rpc.Api.isSimulationError(result)) {
        throw new SimulationFailedError('Simulation failed', result.events);
      }

      if (rpc.Api.isSimulationSuccess(result)) {
        return {
          resourceFee: result.minResourceFee,
          latestLedger: result.latestLedger,
          transactionData: result.transactionData.build().toXDR().toString('base64'),
          auth: result.result?.auth || [],
          events: result.events || [],
        };
      }

      throw new Error('Unexpected simulation result type');
    } catch (err: unknown) {
      this.logger.error({ err: getErrorMessage(err) }, 'Transaction simulation failed');
      throw err;
    }
  }

  async estimate(xdr: string): Promise<EstimateResponse> {
    const networkPassphrase = this.config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    let tx: Transaction;
    try {
      tx = TransactionBuilder.fromXDR(xdr, networkPassphrase) as Transaction;
    } catch (err: unknown) {
      throw new ValidationError('Invalid transaction XDR');
    }

    try {
      const feeStats = await this.horizon.feeStats();
      const baseInclusionFee = (parseInt(feeStats.fee_charged.p70 || '100') * tx.operations.length).toString();

      let resourceFee = '0';
      if (this.isSorobanTransaction(tx)) {
        const sim = await this.simulate(xdr);
        resourceFee = ((BigInt(sim.resourceFee) * 115n) / 100n).toString();
      }

      return {
        estimatedFee: (BigInt(baseInclusionFee) + BigInt(resourceFee)).toString(),
        breakdown: { baseFee: baseInclusionFee, resourceFee },
        network: this.config.network,
        note: 'Actual fee may vary based on network conditions at submission time',
      };
    } catch (err: unknown) {
      throw new SubmissionFailedError(`Fee estimation failed: ${getErrorMessage(err)}`);
    }
  }
}
