/**
 * Configuration for the Grat SDK client.
 */
export interface GratConfig {
  /** The URL of the Grat relay server. */
  relayUrl: string;
  /** The Stellar network to use. Defaults to 'testnet'. */
  network?: 'testnet' | 'mainnet';
  /** Optional API key for authentication. Required for mainnet. */
  apiKey?: string;
  /** Maximum number of retries for failed requests. Defaults to 3. */
  maxRetries?: number;
  /** Request timeout in milliseconds. Defaults to 30000ms. */
  timeout?: number;
}

/**
 * Result of a successful transaction sponsorship.
 */
export interface SponsorResult {
  /** The hash of the submitted transaction. */
  hash: string;
  /** The ledger number in which the transaction was included. */
  ledger: number;
  /** The fee paid for the transaction in stroops. */
  feePaid: string;
  /** The network passphrase used. */
  network: string;
  /** The public key of the channel account used for sponsorship. */
  channelAccount: string;
}

/**
 * Resource cost estimates from Soroban simulation.
 */
export interface SimulationResult {
  /** Execution costs. */
  cost: {
    /** CPU instructions consumed. */
    cpuInstructions: string;
    /** Memory used in bytes. */
    memoryBytes: string;
  };
  /** Minimum resource fee required for the transaction. */
  resourceFee: string;
  /** The latest ledger sequence known by the RPC. */
  latestLedger: number;
  /** Base64 XDR of the Soroban transaction data (modified if simulation succeeded). */
  transactionData: string;
  /** Authorization requirements discovered during simulation. */
  auth?: any[];
  /** Diagnostic events emitted during simulation. */
  events?: any[];
}

/**
 * Combined fee estimate for a transaction.
 */
export interface EstimateResult {
  /** Recommended base fee per operation in stroops. */
  baseFee: string;
  /** Total estimated fee for the entire transaction (including Soroban resource fees if applicable). */
  estimatedFee: string;
  /** Type of transaction detected ('classic' or 'soroban'). */
  type: 'classic' | 'soroban';
}

/**
 * Health status of the relay server.
 */
export interface HealthStatus {
  /** Current status of the server ('ok' or 'error'). */
  status: string;
  /** Server version. */
  version: string;
  /** Network name. */
  network: string;
  /** Current channel pool statistics. */
  pool?: {
    total: number;
    funded: number;
    totalXlm: string;
  };
}
