import { Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import {
  GratConfig,
  SponsorResult,
  SimulationResult,
  EstimateResult,
  HealthStatus,
} from './types.js';
import { GratError, handleResponseError, NetworkError } from './errors.js';

const SDK_VERSION = '0.3.2';

export class Grat {
  private config: Required<GratConfig>;
  private static testnetLogged = false;
  
  /**
   * Shorthand to create a testnet-configured client.
   */
  static testnet(relayUrl?: string): Grat {
    return new Grat({ relayUrl: relayUrl || 'http://127.0.0.1:3000', network: 'testnet' });
  }

  /**
   * Shorthand to create a mainnet-configured client.
   */
  static mainnet(apiKey: string, relayUrl: string): Grat {
    return new Grat({ apiKey, relayUrl, network: 'mainnet' });
  }

  /**
   * Create a new Grat SDK client.
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
      fetch: config.fetch || globalThis.fetch.bind(globalThis),
    };
  }

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

  async sponsorContract(transaction: Transaction): Promise<SponsorResult> {
    return this.sponsor(transaction);
  }

  async simulate(transaction: Transaction): Promise<SimulationResult> {
    return this.request<SimulationResult>('/v1/simulate', {
      method: 'POST',
      body: JSON.stringify({
        transaction: transaction.toXDR(),
      }),
    });
  }

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
      const response = await this.config.fetch(url, {
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
