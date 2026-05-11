import {
  rpc,
  Transaction,
  FeeBumpTransaction,
  xdr,
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
          return {
            hash,
            status: 'SUCCESS',
            ledger: txResponse.ledger,
            feePaid: txResponse.resultMetaXdr?.toXDR('base64') || txResponse.resultMetaXdr, 
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
      return {
        publicKey: account.accountId ? account.accountId() : (account.id || publicKey),
        sequenceNumber: account.sequenceNumber(),
        balances: (account.balances || []).map((b: any) => ({
          asset_type: b.asset_type,
          asset_code: b.asset_code,
          asset_issuer: b.asset_issuer,
          balance: b.balance,
        })),
      };
    } catch (err) {
      throw new Error(`getAccount failed for ${publicKey}: ${err instanceof Error ? err.message : String(err)}`);
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

    return {
      cost: {
        cpuInstructions: response.cost?.cpuIns || '0',
        memoryBytes: response.cost?.memBytes || '0',
      },
      resourceFee: response.minResourceFee || '0',
      transactionData: response.transactionData?.toXDR ? response.transactionData.toXDR('base64') : (response.transactionData || ''),
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
