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
} from './stellar-client';
import { Logger } from 'pino';

export class RpcClient implements StellarClient {
  private server: rpc.Server;

  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
    private readonly config: any,
    private readonly logger: Logger
  ) {
    this.server = new rpc.Server(this.rpcUrl);
  }

  async submitTransaction(tx: Transaction | FeeBumpTransaction): Promise<SubmissionResult> {
    const hash = tx.hash().toString('hex');
    try {
      const response: any = await this.server.sendTransaction(tx);

      if (response.status === 'ERROR') {
        this.logger.error({ hash, response }, 'Transaction rejected by RPC');
        return {
          hash,
          status: 'FAILED',
          errorCode: response.errorResultXdr || response.errorResult,
          errorMessage: 'Transaction rejected by RPC',
        };
      }

      if (response.status === 'DUPLICATE') {
        return this.pollForConfirmation(hash);
      }

      return this.pollForConfirmation(hash);
    } catch (err: any) {
      this.logger.error({ err, hash }, 'RPC submission failed');
      return {
        hash,
        status: 'FAILED',
        errorMessage: err.message,
      };
    }
  }

  private async pollForConfirmation(hash: string): Promise<SubmissionResult> {
    const timeout = this.config.txConfirmationTimeoutMs || 30000;
    const interval = this.config.txConfirmationPollIntervalMs || 1000;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const txResponse: any = await this.server.getTransaction(hash);
        
        if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          const feeCharged = txResponse.feeCharged ?? txResponse.feeBump?.feeCharged ?? '0';
          return {
            hash,
            status: 'SUCCESS',
            ledger: txResponse.ledger,
            feePaid: feeCharged.toString(),
          };
        }

        if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
          return {
            hash,
            status: 'FAILED',
            errorCode: txResponse.resultXdr?.toXDR('base64') || txResponse.resultXdr,
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
      const account: any = await this.server.getAccount(publicKey);
      
      let balances = account.balances || [];
      
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
          this.logger.debug({ publicKey, err: (e as any).message }, 'Failed to fetch ledger entry for balance');
        }
      }

      return {
        publicKey: account.accountId ? account.accountId() : (account.id || publicKey),
        sequenceNumber: account.sequenceNumber ? account.sequenceNumber() : (account.sequence || "0"),
        balances: balances.map((b: any) => ({
          asset_type: b.asset_type || b.assetType || (b.asset === 'native' ? 'native' : b.asset) || 'native',
          asset_code: b.asset_code || b.assetCode,
          asset_issuer: b.asset_issuer || b.issuer,
          balance: b.amount || b.balance || "0",
        })),
      };
    } catch (err: any) {
      const isNotFound = err?.response?.status === 404 || 
                         err?.name === 'NotFoundError' || 
                         err?.message?.includes('404') ||
                         err?.message?.includes('not found');
      
      if (isNotFound) {
        const error = new Error(`Account not found: ${publicKey}`);
        (error as any).status = 404;
        (error as any).name = 'NotFoundError';
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

  async estimateFee(tx: Transaction): Promise<FeeEstimate> {
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
    const response: any = await this.server.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationError(response)) {
      throw new Error(`Simulation failed: ${response.error}`);
    }

    let transactionData = '';
    const td = response.transactionData;
    if (typeof td === 'string') {
      transactionData = td;
    } else if (td?.build) {
      transactionData = td.build().toXDR('base64');
    } else if (td?.toXDR) {
      transactionData = td.toXDR('base64');
    }

    return {
      resourceFee: response.minResourceFee || '0',
      latestLedger: response.latestLedger || 0,
      transactionData,
      auth: response.result?.auth || response.auth || [],
      events: response.events || [],
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
