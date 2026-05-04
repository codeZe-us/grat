import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Grat } from '../src/Grat';
import { Transaction, Networks, Keypair, Operation, Asset, TransactionBuilder, Account } from '@stellar/stellar-sdk';
import { 
  GratError, 
  ValidationError, 
  ChannelExhaustedError, 
  SubmissionFailedError, 
  SimulationFailedError,
  RateLimitError,
  NetworkError
} from '../src/errors';

// Mock global fetch
global.fetch = vi.fn();

describe('Grat SDK Unit Tests', () => {
  let userKeypair: Keypair;
  let sampleTx: Transaction;

  beforeEach(() => {
    vi.clearAllMocks();
    userKeypair = Keypair.random();
    sampleTx = new TransactionBuilder(
      new Account(userKeypair.publicKey(), '1'),
      { fee: '100', networkPassphrase: Networks.TESTNET }
    )
      .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
      .setTimeout(30)
      .build();
    sampleTx.sign(userKeypair);
  });

  describe('Constructor & Static Factories', () => {
    it('creates with valid testnet config', () => {
      const grat = new Grat({ relayUrl: 'http://localhost:3000' });
      expect(grat).toBeDefined();
    });

    it('creates with valid mainnet config', () => {
      const grat = new Grat({ relayUrl: 'https://relay.grat.network', network: 'mainnet', apiKey: 'test-key' });
      expect(grat).toBeDefined();
    });

    it('throws on mainnet without API key', () => {
      expect(() => new Grat({ relayUrl: 'https://relay.grat.network', network: 'mainnet' }))
        .toThrow('API key is required for mainnet');
    });

    it('throws on invalid URL', () => {
      expect(() => new Grat({ relayUrl: 'invalid-url' }))
        .toThrow('Invalid relay URL');
    });

    it('testnet() creates correctly configured client', () => {
      const grat = Grat.testnet();
      expect(grat).toBeDefined();
    });

    it('mainnet() creates correctly configured client', () => {
      const grat = Grat.mainnet('key', 'https://relay.grat.network');
      expect(grat).toBeDefined();
    });
  });

  describe('sponsor()', () => {
    it('sends correct POST request and returns result', async () => {
      const grat = Grat.testnet();
      const mockResult = { hash: 'txhash', ledger: 100, feePaid: '100', network: 'testnet', channelAccount: 'G...' };
      
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult
      });

      const result = await grat.sponsor(sampleTx);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/sponsor'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Idempotency-Key': expect.any(String),
            'X-SDK-Version': expect.any(String)
          })
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('throws ValidationError on 400', async () => {
      const grat = Grat.testnet();
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid XDR' } })
      });

      await expect(grat.sponsor(sampleTx)).rejects.toThrow(ValidationError);
    });

    it('throws ChannelExhaustedError on 503', async () => {
      const grat = new Grat({ relayUrl: 'http://localhost:3000', maxRetries: 0 });
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { code: 'CHANNELS_EXHAUSTED', message: 'Busy' } })
      });

      await expect(grat.sponsor(sampleTx)).rejects.toThrow(ChannelExhaustedError);
    });

    it('retries on 429 with Retry-After delay', async () => {
      const grat = new Grat({ relayUrl: 'http://localhost:3000', maxRetries: 1 });
      
      (fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '0' }),
          json: async () => ({ error: { code: 'RATE_LIMIT_EXCEEDED' } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ hash: 'success' })
        });

      const result = await grat.sponsor(sampleTx);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.hash).toBe('success');
    });

    it('retries on 500 with exponential backoff and stops after maxRetries', async () => {
      const grat = new Grat({ relayUrl: 'http://localhost:3000', maxRetries: 2 });
      
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR' } })
      });

      await expect(grat.sponsor(sampleTx)).rejects.toThrow(GratError);
      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('simulate()', () => {
    it('sends correct request and returns SimulationResult', async () => {
      const grat = Grat.testnet();
      const mockSim = { cost: { cpuInstructions: '100', memoryBytes: '200' }, resourceFee: '100', latestLedger: 10, transactionData: '...' };
      
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSim
      });

      const result = await grat.simulate(sampleTx);
      expect(result).toEqual(mockSim);
    });

    it('throws SimulationFailedError on error code', async () => {
      const grat = Grat.testnet();
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ error: { code: 'SIMULATION_FAILED', message: 'Fail', details: [] } })
      });

      await expect(grat.simulate(sampleTx)).rejects.toThrow(SimulationFailedError);
    });
  });

  describe('status()', () => {
    it('returns HealthStatus', async () => {
      const grat = Grat.testnet();
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', version: '1.0.0', network: 'testnet' })
      });

      const result = await grat.status();
      expect(result.status).toBe('ok');
    });

    it('throws NetworkError when fetch fails', async () => {
      const grat = new Grat({ relayUrl: 'http://localhost:3000', maxRetries: 0 });
      (fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(grat.status()).rejects.toThrow(NetworkError);
    });
  });
});
