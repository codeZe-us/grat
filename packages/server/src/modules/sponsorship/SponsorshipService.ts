import {
  TransactionBuilder,
  Networks,
  Horizon,
  Transaction,
  FeeBumpTransaction,
  Keypair,
  rpc,
} from '@stellar/stellar-sdk';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { channelManager } from '../channels/ChannelManager';
import { sequenceManager } from '../channels/SequenceManager';
import { redis } from '../../utils/redis';
import {
  RelayError,
  ValidationError,
  ChannelExhaustedError,
  SimulationFailedError,
  SubmissionFailedError,
  NetworkError,
} from '../../utils/errors';
import { Account } from '@stellar/stellar-sdk';

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
  cost: {
    cpuInstructions: string;
    memoryBytes: string;
  };
  resourceFee: string;
  latestLedger: number;
  transactionData: string;
  auth: any[];
  events: any[];
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
    
    // 1. Decode & Validate
    let innerTx: Transaction;
    try {
      const txEnvelope = TransactionBuilder.fromXDR(req.transaction, networkPassphrase);
      if (!(txEnvelope instanceof Transaction)) {
        throw new Error('Fee-bump transactions cannot be sponsored');
      }
      innerTx = txEnvelope;
    } catch (err: any) {
      throw new ValidationError('Invalid transaction XDR');
    }

    // 2. Validate Signatures (at least one)
    if (innerTx.signatures.length === 0) {
      throw new ValidationError('Transaction must be signed by the source account');
    }

    // 3. Retry Loop for submission
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      let channel = await channelManager.acquire();
      if (!channel) {
        throw new ChannelExhaustedError();
      }

      try {
        // 4. Build Fee Bump
        const feeStats = await this.horizon.feeStats();
        const baseFee = feeStats.fee_charged.p70 || '100';

        // Get next sequence and prepare Account object
        const nextSeq = await sequenceManager.getNext(channel.publicKey);
        const account = new Account(channel.publicKey, (BigInt(nextSeq) - 1n).toString());

        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          account,
          baseFee,
          innerTx,
          networkPassphrase
        );

        // 5. Sign
        feeBump.sign(channel.keypair);

        // 6. Submit
        const result = await this.horizon.submitTransaction(feeBump);
        
        // Testnet readable logging
        if (config.network === 'testnet') {
          const ops = innerTx.operations.map(op => op.type).join(', ');
          const source = `${innerTx.source?.substring(0, 4)}...${innerTx.source?.substring(52)}`;
          console.log(`[${new Date().toISOString()}] SPONSOR: Source=${source} Ops=[${ops}] Fee=${feeBump.fee} Hash=${result.hash} Channel=${channel.publicKey.substring(0, 4)}...`);
        }

        return {
          hash: result.hash,
          ledger: result.ledger,
          feePaid: feeBump.fee,
          network: config.network,
          channelAccount: channel.publicKey,
        };

      } catch (err: any) {
        const resultCodes = err.response?.data?.extras?.result_codes;
        const opResultCodes = resultCodes?.op_res_codes;

        logger.warn({
          msg: 'Submission failed',
          requestId,
          retries,
          code: resultCodes?.transaction,
          opCodes: opResultCodes,
        });

        // Retry logic for specific codes
        if (resultCodes?.transaction === 'tx_bad_seq' || err.response?.status === 503) {
          // If sequence is bad, sync from Horizon to reset cache
          if (resultCodes?.transaction === 'tx_bad_seq') {
            await sequenceManager.sync(channel.publicKey);
          }

          if (retries < maxRetries) {
            retries++;
            const backoff = Math.pow(2, retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue; // Retry with new channel (locked channel will be released in finally)
          }
        }

        // Non-retryable or max retries reached
        throw new SubmissionFailedError(
          err.response?.data?.title || err.message,
          err.response?.data?.extras
        );

      } finally {
        await channelManager.release(channel.publicKey);
      }
    }

    throw new Error('Max retries exceeded');
  }

  async checkIdempotency(key: string): Promise<SponsorResponse | null> {
    const cached = await redis.get(`idempotency:${key}`);
    return cached ? JSON.parse(cached) : null;
  }

  async setIdempotency(key: string, result: SponsorResponse) {
    await redis.set(`idempotency:${key}`, JSON.stringify(result), 'EX', 86400); // 24h
  }

  async simulate(xdr: string): Promise<SimulationResult> {
    try {
      const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET); // passphrases will be ignored for simulation
      const result = await this.rpc.simulateTransaction(tx as Transaction);

      if (rpc.Api.isSimulationError(result)) {
        throw new SimulationFailedError('Simulation failed', result.events);
      }

      if (rpc.Api.isSimulationSuccess(result)) {
        return {
          cost: {
            cpuInstructions: result.cost.cpuInsns,
            memoryBytes: result.cost.memBytes,
          },
          resourceFee: result.minResourceFee,
          latestLedger: result.latestLedger,
          transactionData: result.transactionData.build().toXDR().toString('base64'),
          auth: result.result?.auth || [],
          events: result.events || [],
        };
      }

      throw new Error('Unexpected simulation result type');
    } catch (err: any) {
      if (err instanceof RelayError) throw err;
      throw new ValidationError(err.message || 'Error parsing transaction XDR');
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
      try {
        const sim = await this.simulate(xdr);
        resourceFee = sim.resourceFee;
      } catch (err) {
        // Fallback or rethrow? For estimation, we probably want to rethrow simulation errors
        throw err;
      }
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
