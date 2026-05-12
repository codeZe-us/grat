import {
  rpc,
  Transaction,
  FeeBumpTransaction,
  xdr,
  Keypair,
} from '@stellar/stellar-sdk';
import {
  StellarClient,
  AccountInfo,
  SubmissionResult,
  FeeEstimate,
  SimulationResult,
  Balance,
} from './stellar-client';
import { Logger } from 'pino';

export interface RpcConfig {
  txConfirmationTimeoutMs?: number;
  txConfirmationPollIntervalMs?: number;
  baseFee?: string;
  feeMultiplier?: number;
  circuitBreakerEnabled?: boolean;
  circuitBreakerHourlyLimit?: string;
  circuitBreakerMinuteLimit?: string;
}

export class RpcClient implements StellarClient {
  private server: rpc.Server;

  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
    private readonly config: RpcConfig,
    private readonly logger: Logger
  ) {
    this.server = new rpc.Server(this.rpcUrl);
  }

  async submitTransaction(tx: Transaction | FeeBumpTransaction): Promise<SubmissionResult> {
    const hash = tx.hash().toString('hex');
    try {
      const response = await this.server.sendTransaction(tx);

      if (response.status === 'ERROR') {
        this.logger.error({ hash, response }, 'Transaction rejected by RPC');
        return {
          hash,
          status: 'FAILED',
          errorCode: (response as any).errorResult || (response as any).errorResultXdr,
          errorMessage: 'Transaction rejected by RPC',
        };
      }

      if (response.status === 'DUPLICATE') {
        return this.pollForConfirmation(hash);
      }

      return this.pollForConfirmation(hash);
    } catch (err: unknown) {
      this.logger.error({ err, hash }, 'RPC submission failed');
      return {
        hash,
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async pollForConfirmation(hash: string): Promise<SubmissionResult> {
    const timeout = this.config.txConfirmationTimeoutMs ?? 30000;
    const interval = this.config.txConfirmationPollIntervalMs ?? 1000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const txResponse = await this.server.getTransaction(hash);
        
        if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          const r = txResponse as rpc.Api.GetSuccessfulTransactionResponse;
          const feeCharged = (r as unknown as Record<string, unknown>).feeCharged ?? '0';
          return {
            hash,
            status: 'SUCCESS',
            ledger: r.ledger,
            feePaid: feeCharged.toString(),
          };
        }

        if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
          return {
            hash,
            status: 'FAILED',
            errorCode: txResponse.resultXdr?.toXDR('base64'),
            errorMessage: 'Transaction failed on chain',
          };
        }
      } catch (err) {
        this.logger.debug({ hash, err }, 'Polling for transaction failed, retrying...');
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return {
      hash,
      status: 'PENDING',
      errorMessage: 'Confirmation timeout reached',
    };
  }

  async getAccount(publicKey: string): Promise<AccountInfo> {
    try {
      const account = await this.server.getAccount(publicKey);
      const rawAccount = account as unknown as Record<string, unknown>;
      
      const balances = (rawAccount.balances as Balance[]) || [];
      
      if (balances.length === 0) {
        try {
          const ledgerKey = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({
            accountId: Keypair.fromPublicKey(publicKey).xdrPublicKey()
          }));
          
          const entries = await this.server.getLedgerEntries(ledgerKey);
          if (entries.entries && entries.entries.length > 0) {
            const entry = entries.entries[0];
            const accountEntry = entry.val.account();
            const balanceStroops = accountEntry.balance().toString();
            const balanceXlm = (BigInt(balanceStroops) / 10_000_000n).toString();
            
            balances.push({
              asset_type: 'native',
              balance: balanceXlm
            });
          }
        } catch (e) {
          this.logger.debug({ publicKey, err: e instanceof Error ? e.message : String(e) }, 'Failed to fetch ledger entry for balance');
        }
      }

      const rawBalances = balances as unknown as Record<string, unknown>[];
      return {
        publicKey: typeof rawAccount.accountId === 'function'
          ? (rawAccount.accountId as () => string)()
          : ((rawAccount.id as string) || publicKey),
        sequenceNumber: typeof rawAccount.sequenceNumber === 'function'
          ? (rawAccount.sequenceNumber as () => string)()
          : ((rawAccount.sequence as string) || '0'),
        balances: rawBalances.map((b) => ({
          asset_type: (b.asset_type || b.assetType || (b.asset === 'native' ? 'native' : b.asset) || 'native') as string,
          asset_code: (b.asset_code || b.assetCode) as string | undefined,
          asset_issuer: (b.asset_issuer || b.issuer) as string | undefined,
          balance: (b.amount || b.balance || '0') as string,
        })),
      };
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const isNotFound = (e?.response as Record<string, unknown>)?.status === 404 || 
                         e?.name === 'NotFoundError' || 
                         (e?.message as string)?.includes('404') ||
                         (e?.message as string)?.includes('not found');
      
      if (isNotFound) {
        const error = new Error(`Account not found: ${publicKey}`) as Error & { status: number; name: string };
        error.status = 404;
        error.name = 'NotFoundError';
        throw error;
      }
      
      throw err;
    }
  }

  async getSequenceNumber(publicKey: string): Promise<string> {
    const account = await this.getAccount(publicKey);
    return account.sequenceNumber;
  }

  async getAccountBalance(publicKey: string): Promise<string> {
    const account = await this.getAccount(publicKey);
    const nativeBalance = account.balances.find((b) => b.asset_type === 'native');
    if (!nativeBalance) return '0';
    return (parseFloat(nativeBalance.balance) * 10_000_000).toFixed(0);
  }

  async estimateFee(_tx: Transaction): Promise<FeeEstimate> {
    try {
      const baseFee = this.config.baseFee || '100';
      const multiplier = this.config.feeMultiplier || 1.5;
      const recommendedFee = (parseInt(baseFee) * multiplier).toFixed(0);
      
      return {
        baseFee,
        recommendedFee,
      };
    } catch {
      return { baseFee: '100', recommendedFee: '150' };
    }
  }

  async simulateTransaction(tx: Transaction): Promise<SimulationResult> {
    const response = await this.server.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationError(response)) {
      throw new Error(`Simulation failed: ${response.error}`);
    }

    const successResponse = response as rpc.Api.SimulateTransactionSuccessResponse;
    let transactionData = '';
    const td = successResponse.transactionData as unknown as Record<string, unknown> | string | undefined;
    if (typeof td === 'string') {
      transactionData = td;
    } else if (td && typeof (td as Record<string, unknown>).build === 'function') {
      transactionData = ((td as Record<string, unknown>).build as () => { toXDR: (f: string) => string })().toXDR('base64');
    } else if (td && typeof (td as Record<string, unknown>).toXDR === 'function') {
      transactionData = ((td as Record<string, unknown>).toXDR as (f: string) => string)('base64');
    }

    const rawResponse = successResponse as unknown as Record<string, unknown>;
    return {
      resourceFee: (successResponse.minResourceFee as string | undefined) || '0',
      latestLedger: (successResponse.latestLedger as number | undefined) || 0,
      transactionData,
      auth: (rawResponse.result as Record<string, unknown> | undefined)?.auth as unknown[] || (rawResponse.auth as unknown[]) || [],
      events: (successResponse.events as unknown[]) || [],
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.server.getHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}
