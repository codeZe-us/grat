import { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import {
  GratConfig,
  SponsorResult,
  SimulationResult,
  EstimateResult,
  HealthStatus,
  GratError,
} from './types';

// Package version for headers
const SDK_VERSION = '0.1.0';

/**
 * Main client for interacting with the Grat Relay Server.
 */
export class Grat {
  private config: Required<GratConfig>;

  /**
   * Initialize a new Grat client.
   * @param config Configuration options for the relay client.
   */
  constructor(config: GratConfig) {
    this.config = {
      relayUrl: config.relayUrl.replace(/\/$/, ''),
      network: config.network || 'testnet',
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

      // Handle 429 Rate Limit
      if (response.status === 429 && retryCount < this.config.maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
        await this.delay(retryAfter);
        return this.request<T>(path, options, retryCount + 1);
      }

      // Handle 503 or other 5xx errors with exponential backoff
      if ((response.status === 503 || response.status >= 500) && retryCount < this.config.maxRetries) {
        const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await this.delay(backoff);
        return this.request<T>(path, options, retryCount + 1);
      }

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new GratError(
          data.error?.message || 'Unknown relay error',
          data.error?.code || 'RELAY_ERROR',
          response.status,
          data.error?.details,
          data.error?.requestId
        );
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      
      if (err.name === 'AbortError') {
        throw new GratError('Request timeout', 'TIMEOUT', 408);
      }

      if (err instanceof GratError) throw err;

      // Handle network errors with retry
      if (retryCount < this.config.maxRetries) {
        const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await this.delay(backoff);
        return this.request<T>(path, options, retryCount + 1);
      }

      throw new GratError(err.message || 'Network error', 'NETWORK_ERROR', 503);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
