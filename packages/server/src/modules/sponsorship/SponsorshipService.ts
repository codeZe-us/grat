import {
  TransactionBuilder,
  Networks,
  Horizon,
  Transaction,
  rpc,
} from '@stellar/stellar-sdk';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { channelManager } from '../channels/ChannelManager';
import { sequenceManager } from '../channels/SequenceManager';
import { creditService } from './CreditService';
import { circuitBreaker } from '../../utils/circuitBreaker';
import { redis } from '../../utils/redis';
import {
  ValidationError,
  ChannelExhaustedError,
  SimulationFailedError,
  SubmissionFailedError,
  FrozenEntryError,
} from '../../utils/errors';

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

export class SponsorshipService {
  private horizon: Horizon.Server;
  private rpc: rpc.Server;

  constructor() {
    this.horizon = new Horizon.Server(config.horizonUrl);
    this.rpc = new rpc.Server(config.sorobanRpcUrl);
  }

  async sponsor(req: SponsorRequest, requestId: string): Promise<SponsorResponse> {
    const networkPassphrase = req.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    
    let innerTx: Transaction;
    try {
      const txEnvelope = TransactionBuilder.fromXDR(req.transaction, networkPassphrase);
      if (!(txEnvelope instanceof Transaction)) {
        throw new Error('Fee-bump transactions cannot be sponsored');
      }
      innerTx = txEnvelope;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid transaction XDR';
      throw new ValidationError(message);
    }

    if (innerTx.signatures.length === 0) {
      throw new ValidationError('Transaction must be signed by the source account');
    }

    // SECURITY: Prevent using channel accounts as inner transaction sources (Global)
    if (channelManager.isChannelAccount(innerTx.source)) {
      throw new ValidationError('Channel accounts cannot be used as inner transaction sources');
    }

    for (const op of innerTx.operations) {
      if (op.source && channelManager.isChannelAccount(op.source)) {
        throw new ValidationError('Channel accounts cannot be used as operation source accounts');
      }

      if (op.type === 'accountMerge' && channelManager.isChannelAccount(op.destination)) {
        throw new ValidationError('Channel accounts cannot be merged into other accounts');
      }

      if (op.type === 'setOptions' && (op as any).signer && channelManager.isChannelAccount(innerTx.source)) {
         // This is secondary check as channel-as-source is already blocked.
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const maxAllowedTime = now + 600; 
    
    if (innerTx.timeBounds) {
      const maxTime = parseInt(innerTx.timeBounds.maxTime);
      if (maxTime === 0 || maxTime > maxAllowedTime) {
         throw new ValidationError('Transaction expiration (maxTime) is too far in the future or infinite');
      }
    } else {
      throw new ValidationError('Transaction must have time bounds set');
    }

    let retries = 0;
    const maxRetries = 3;

    await circuitBreaker.check();

    while (retries <= maxRetries) {
      const channel = await channelManager.acquire();
      if (!channel) {
        throw new ChannelExhaustedError();
      }

      let minOuterFee: bigint | undefined;

      try {
        const feeStats = await this.horizon.feeStats();
        const baseFee = feeStats.fee_charged.p70 || '100';

        const innerFee = BigInt(innerTx.fee);
        const numOps = BigInt(innerTx.operations.length);
        minOuterFee = innerFee + (numOps + 1n) * BigInt(baseFee);

        // SECURITY: Enforce maximum fee cap
        if (minOuterFee > BigInt(config.maxSponsorFeeStroops)) {
          throw new ValidationError(`Transaction fee (${minOuterFee} stroops) exceeds maximum allowed (${config.maxSponsorFeeStroops} stroops)`);
        }

        const apiKey = (req as any).apiKey;
        if (apiKey && config.network === 'mainnet') {
          await creditService.placeHold(apiKey.id, minOuterFee);
        }

        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          channel.publicKey,
          minOuterFee.toString(),
          innerTx,
          networkPassphrase
        );

        feeBump.sign(channel.keypair);

        const result = await Promise.race([
          this.horizon.submitTransaction(feeBump),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Horizon submission timeout')), 25000))
        ]) as any;
        
        if (config.network === 'testnet') {
          const ops = innerTx.operations.map(op => op.type).join(', ');
          const source = `${innerTx.source?.substring(0, 4)}...${innerTx.source?.substring(52)}`;
          logger.info({ hash: result.hash, channel: channel.publicKey }, `SPONSOR SUCCESS: ${source} [${ops}]`);
        }

        await circuitBreaker.record(
          BigInt(feeBump.fee), 
          (req as any).apiKey?.key_prefix || 'anonymous'
        );

        if (apiKey && config.network === 'mainnet') {
          await creditService.confirmDeduction(apiKey.id, minOuterFee, BigInt(feeBump.fee));
        }

        return {
          hash: result.hash,
          ledger: result.ledger,
          feePaid: feeBump.fee,
          network: config.network,
          channelAccount: channel.publicKey,
        };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultCodes = (err as any).response?.data?.extras?.result_codes;
        const opResultCodes = resultCodes?.op_res_codes;

        logger.warn({
          msg: 'Submission failed, checking retry conditions',
          requestId,
          retries,
          code: resultCodes?.transaction,
          opCodes: opResultCodes,
          err: err.message
        });

        if (resultCodes?.transaction === 'tx_frozen' || resultCodes?.inner_transaction?.transaction === 'tx_frozen') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const frozenKeys = (err as any).response?.data?.extras?.frozen_keys || [];
          logger.warn({ msg: 'Transaction rejected due to frozen entry', requestId, frozenKeys });
          throw new FrozenEntryError(undefined, frozenKeys);
        }

        if (resultCodes?.transaction === 'tx_bad_seq' || err.response?.status === 503 || err.message === 'Horizon submission timeout') {
          if (resultCodes?.transaction === 'tx_bad_seq') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sequenceManager.sync(channel.publicKey);
          }

          if (retries < maxRetries) {
            retries++;
            const backoff = Math.pow(2, retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extras = (err as any).response?.data?.extras;
        const txResult = extras?.result_codes?.transaction;
        let opResult = extras?.result_codes?.operations?.[0];

        if (txResult === 'tx_fee_bump_inner_failed' && extras?.result_codes?.inner_transaction?.operations) {
          opResult = extras.result_codes.inner_transaction.operations[0];
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = opResult || txResult || (err as any).response?.data?.title || (err as Error).message;
        
        const apiKey = (req as any).apiKey;
        if (apiKey && config.network === 'mainnet' && txResult !== 'tx_bad_seq' && minOuterFee) {
          await creditService.releaseHold(apiKey.id, minOuterFee).catch(e => 
            logger.error({ err: e, apiKeyId: apiKey.id }, 'Failed to release credit hold after submission error')
          );
        }

        throw new SubmissionFailedError(`Transaction Failed: ${msg}`, extras);

      } finally {
        await channelManager.release(channel.publicKey);
      }
    }

    throw new Error('Max retries exceeded');
  }

  async checkIdempotency(key: string, apiKeyId?: string): Promise<SponsorResponse | null> {
    const scope = apiKeyId || 'public';
    const cached = await redis.get(`idempotency:${scope}:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  async setIdempotency(key: string, result: SponsorResponse, apiKeyId?: string) {
    const scope = apiKeyId || 'public';
    await redis.set(`idempotency:${scope}:${key}`, JSON.stringify(result), 'EX', 86400);
  }

  async simulate(xdr: string): Promise<SimulationResult> {
    try {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      
      const isSoroban = tx.operations.some(op => 
        op.type === 'invokeHostFunction' || 
        op.type === 'extendFootprintTtl' || 
        op.type === 'restoreFootprint'
      );

      if (!isSoroban) {
        return {
          resourceFee: '0',
          latestLedger: 0,
          transactionData: xdr,
          auth: [],
          events: [],
        };
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
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any).response?.data?.extras?.result_codes?.operations?.[0] || (err as any).response?.data?.detail || (err as Error).message;
      logger.error({ err, detail }, 'Transaction simulation failed');
      throw new SubmissionFailedError(`Transaction Failed: ${detail}`);
    }
  }

  async estimate(xdr: string): Promise<EstimateResponse> {
    const networkPassphrase = config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    let tx: Transaction;
    try {
      tx = TransactionBuilder.fromXDR(xdr, networkPassphrase) as Transaction;
    } catch (err) {
      throw new ValidationError('Invalid transaction XDR');
    }

    const feeStats = await this.horizon.feeStats();
    const baseInclusionFee = (parseInt(feeStats.fee_charged.p70 || '100') * tx.operations.length).toString();

    let resourceFee = '0';

    // Detect if Soroban
    const isSoroban = tx.operations.some(op => 
      op.type === 'invokeHostFunction' || 
      op.type === 'extendFootprintTtl' || 
      op.type === 'restoreFootprint'
    );

    if (isSoroban) {
      const sim = await this.simulate(xdr);
      resourceFee = ((BigInt(sim.resourceFee) * 115n) / 100n).toString();
    }

    return {
      estimatedFee: (BigInt(baseInclusionFee) + BigInt(resourceFee)).toString(),
      breakdown: {
        baseFee: baseInclusionFee,
        resourceFee: resourceFee,
      },
      network: config.network,
      note: 'Actual fee may vary based on network conditions at submission time',
    };
  }
}

export const sponsorshipService = new SponsorshipService();
