import { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export interface AccountInfo {
  publicKey: string;
  sequenceNumber: string;
  balances: Balance[];
}

export interface SubmissionResult {
  hash: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  ledger?: number;
  feePaid?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface FeeEstimate {
  baseFee: string;
  recommendedFee: string;
}

export interface SimulationResult {
  resourceFee: string;
  latestLedger: number;
  transactionData: string;
  auth: unknown[];
  events: unknown[];
}

export interface StellarClient {
  submitTransaction(tx: Transaction | FeeBumpTransaction): Promise<SubmissionResult>;
  getAccount(publicKey: string): Promise<AccountInfo>;
  getSequenceNumber(publicKey: string): Promise<string>;
  getAccountBalance(publicKey: string): Promise<string>; // XLM balance in stroops
  estimateFee(tx: Transaction): Promise<FeeEstimate>;
  simulateTransaction(tx: Transaction): Promise<SimulationResult>;
  checkHealth(): Promise<boolean>;
}
