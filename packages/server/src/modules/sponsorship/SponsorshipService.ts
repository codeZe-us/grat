import {
  TransactionBuilder,
  Networks,
  Horizon,
  Transaction,
  FeeBumpTransaction,
  Keypair,
} from '@stellar/stellar-sdk';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { channelManager } from '../channels/ChannelManager';
import { redis } from '../../utils/redis';

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

export class SponsorshipService {
  private horizon: Horizon.Server;

  constructor() {
    this.horizon = new Horizon.Server(config.horizonUrl);
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
      const error: any = new Error('Invalid transaction XDR');
      error.status = 400;
      error.code = 'INVALID_XDR';
      throw error;
    }

    // 2. Validate Signatures (at least one)
    if (innerTx.signatures.length === 0) {
      const error: any = new Error('Transaction must be signed by the source account');
      error.status = 400;
      error.code = 'MISSING_SIGNATURES';
      throw error;
    }

    // 3. Retry Loop for submission
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      let channel = await channelManager.acquire();
      if (!channel) {
        const error: any = new Error('No available channel accounts. Please try again later.');
        error.status = 503;
        error.code = 'CHANNELS_EXHAUSTED';
        throw error;
      }

      try {
        // 4. Build Fee Bump
        const feeStats = await this.horizon.feeStats();
        const baseFee = feeStats.fee_charged.p70 || '100';

        const feeBump = TransactionBuilder.buildFeeBumpTransaction(
          channel.keypair,
          baseFee,
          innerTx,
          networkPassphrase
        );

        // 5. Sign
        feeBump.sign(channel.keypair);

        // 6. Submit
        const result = await this.horizon.submitTransaction(feeBump);
        
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
          if (retries < maxRetries) {
            retries++;
            const backoff = Math.pow(2, retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue; // Retry with new channel (locked channel will be released in finally)
          }
        }

        // Non-retryable or max retries reached
        const error: any = new Error(err.response?.data?.title || err.message);
        error.status = err.response?.status || 500;
        error.code = resultCodes?.transaction || 'SUBMISSION_FAILED';
        error.details = err.response?.data?.extras;
        throw error;

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
}

export const sponsorshipService = new SponsorshipService();
