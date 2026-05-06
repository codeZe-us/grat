import { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import {
  GratConfig,
  SponsorResult,
  SimulationResult,
  EstimateResult,
  HealthStatus,
} from './types';
import { GratError, handleResponseError, NetworkError } from './errors';

// Package version for headers
const SDK_VERSION = '0.2.0';

/**
 * Main client for interacting with the Grat Relay Server.
 */
export class Grat {
  private config: Required<GratConfig>;
  private static testnetLogged = false;

  /**
   * Shorthand to create a testnet-configured client.
   * @param relayUrl Optional relay URL (defaults to http://localhost:3000).
   */
  static testnet(relayUrl?: string): Grat {
    return new Grat({ relayUrl: relayUrl || 'http://127.0.0.1:3000', network: 'testnet' });
  }

  /**
   * Shorthand to create a mainnet-configured client.
   * @param apiKey Required API key for mainnet.
   * @param relayUrl Required relay URL for mainnet.
   */
  static mainnet(apiKey: string, relayUrl: string): Grat {
    return new Grat({ apiKey, relayUrl, network: 'mainnet' });
  }

  /**
   * Initialize a new Grat client.
   * @param config Configuration options for the relay client.
   */
  constructor(config: GratConfig) {
    const network = config.network || 'testnet';
    const relayUrl = config.relayUrl || (network === 'testnet' ? 'http://127.0.0.1:3000' : '');


    if (network === 'mainnet') {
      if (!config.apiKey) {
        throw new Error('API key is required for mainnet. Get one at https://grat.network');
      }
      if (!config.relayUrl) {
        throw new Error('Relay URL is required for mainnet.');
      }
    }

    if (relayUrl) {
      try {
        new URL(relayUrl);
      } catch (e) {
        throw new Error(`Invalid relay URL: ${relayUrl}`);
      }
    }

    this.config = {
      relayUrl: relayUrl.replace(/\/$/, ''),
      network,
      apiKey: config.apiKey || '',
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * Sponsor a transaction by wrapping it in a fee-bump envelope.
   * @param transaction The signed transaction or fee-bump transaction to sponsor.
   * @returns The result of the transaction submission.
   * @throws {GratError} If the relay server returns an error.
   */
  async sponsor(transaction: Transaction | FeeBumpTransaction): Promise<SponsorResult> {
    const xdr = transaction.toXDR();
    const idempotencyKey = crypto.randomUUID();

    return this.request<SponsorResult>('/v1/sponsor', {
      method: 'POST',
      body: JSON.stringify({
        transaction: xdr,
        network: this.config.network,
      }),
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    });
  }

  /**
   * Alias for sponsor, specifically for Soroban transactions.
   * @param transaction The Soroban transaction to sponsor.
   */
  async sponsorContract(transaction: Transaction): Promise<SponsorResult> {
    return this.sponsor(transaction);
  }

  /**
   * Simulate a Soroban transaction to get resource estimates.
   * @param transaction The Soroban transaction to simulate.
   */
  async simulate(transaction: Transaction): Promise<SimulationResult> {
    return this.request<SimulationResult>('/v1/simulate', {
      method: 'POST',
      body: JSON.stringify({
        transaction: transaction.toXDR(),
      }),
    });
  }

  /**
   * Get fee estimates for a transaction.
   * @param transaction The transaction to estimate fees for.
   */
  async estimate(transaction: Transaction | FeeBumpTransaction): Promise<EstimateResult> {
    return this.request<EstimateResult>('/v1/estimate', {
      method: 'POST',
      body: JSON.stringify({
        transaction: transaction.toXDR(),
      }),
    });
  }

  /**
   * Check the health and status of the relay server.
   */
  async status(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health', {
      method: 'GET',
    });
  }

  /**
   * Internal request helper with retry logic.
   */
  private async request<T>(
    path: string,
    options: RequestInit,
    retryCount = 0
  ): Promise<T> {
    if (this.config.network === 'testnet' && !Grat.testnetLogged) {
      console.log('Grat SDK running in testnet mode');
      Grat.testnetLogged = true;
    }

    const url = `${this.config.relayUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-SDK-Version': SDK_VERSION,
      ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);


      if (response.status === 429 && retryCount < this.config.maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
        await this.delay(retryAfter);
        return this.request<T>(path, options, retryCount + 1);
      }


      if ((response.status === 503 || response.status >= 500) && retryCount < this.config.maxRetries) {
        const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await this.delay(backoff);
        return this.request<T>(path, options, retryCount + 1);
      }

      if (!response.ok) {
        await handleResponseError(response);
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      
      const error = err as Error;
      if (error.name === 'AbortError') {
        throw new GratError('Request timeout', 'TIMEOUT', 408);
      }

      if (error instanceof GratError) throw error;
      if (error instanceof NetworkError) throw error;


      if (retryCount < this.config.maxRetries) {
        const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await this.delay(backoff);
        return this.request<T>(path, options, retryCount + 1);
      }

      throw new NetworkError(error.message || 'Network error', 'NETWORK_ERROR', 503);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
