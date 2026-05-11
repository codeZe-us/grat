import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SponsorshipService } from '../src/modules/sponsorship/SponsorshipService';
import { ChannelManager } from '../src/modules/channels/ChannelManager';
import { SequenceManager } from '../src/modules/channels/SequenceManager';
import { CreditService } from '../src/modules/sponsorship/CreditService';
import { TransactionLogger } from '../src/modules/sponsorship/TransactionLogger';
import { CircuitBreaker } from '../src/utils/circuitBreaker';
import { Keypair, TransactionBuilder, Networks, Operation, Account, Asset } from '@stellar/stellar-sdk';
import { ValidationError, SubmissionFailedError, ChannelExhaustedError } from '../src/utils/errors';
import { config } from '../src/config';
import pino from 'pino';

const mockLogger = pino({ level: 'silent' });

const mockChannel = {
  publicKey: Keypair.random().publicKey(),
  keypair: Keypair.random(),
  status: 'available' as const,
};

const mockChannelManager: Partial<ChannelManager> = {
  acquire: vi.fn().mockResolvedValue(mockChannel),
  release: vi.fn().mockResolvedValue(undefined),
  isChannelAccount: vi.fn().mockImplementation((pk: string) => pk === mockChannel.publicKey),
};

const mockCreditService: Partial<CreditService> = {
  placeHold: vi.fn().mockResolvedValue(undefined),
  confirmDeduction: vi.fn().mockResolvedValue(undefined),
  releaseHold: vi.fn().mockResolvedValue(undefined),
};

const mockTransactionLogger: Partial<TransactionLogger> = {
  log: vi.fn().mockResolvedValue(undefined),
};

const mockCircuitBreaker: Partial<CircuitBreaker> = {
  check: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
};

const mockRedis: any = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
};

const mockStellarClient: any = {
  estimateFee: vi.fn().mockResolvedValue({ baseFee: '100', recommendedFee: '150' }),
  submitTransaction: vi.fn().mockResolvedValue({ 
    hash: 'testhash', 
    ledger: 123, 
    status: 'SUCCESS' 
  }),
  simulateTransaction: vi.fn().mockResolvedValue({
    resourceFee: '0',
    transactionData: '',
    auth: [],
    events: []
  }),
};

const mockConfig = {
  ...config,
  network: 'testnet',
  maxSponsorFeeStroops: '10000000',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

const mockSequenceManager: Partial<SequenceManager> = {
  sync: vi.fn().mockResolvedValue('1'),
  syncAll: vi.fn().mockResolvedValue(undefined),
};

const makeService = () => new SponsorshipService(
  mockStellarClient,
  mockChannelManager as ChannelManager,
  mockSequenceManager as SequenceManager,
  mockCreditService as CreditService,
  mockTransactionLogger as TransactionLogger,
  mockCircuitBreaker as CircuitBreaker,
  mockRedis,
  mockConfig,
  mockLogger
);

const userKeypair = Keypair.random();
const networkPassphrase = Networks.TESTNET;

const buildSignedTx = (sourceKp: Keypair, ops?: any[]) => {
  const builder = new TransactionBuilder(
    new Account(sourceKp.publicKey(), '1'),
    { fee: '100', networkPassphrase }
  );
  if (ops) {
    ops.forEach(op => builder.addOperation(op));
  } else {
    builder.addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        amount: '1',
        asset: Asset.native(),
      })
    );
  }
  const tx = builder.setTimeout(100).build();
  tx.sign(sourceKp);
  return tx;
};

describe('SponsorshipService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockChannelManager.acquire as any).mockResolvedValue(mockChannel);
    (mockChannelManager.isChannelAccount as any).mockImplementation((pk: string) => pk === mockChannel.publicKey);
    (mockCircuitBreaker.check as any).mockResolvedValue(undefined);
    mockStellarClient.estimateFee.mockResolvedValue({ baseFee: '100', recommendedFee: '150' });
    mockStellarClient.submitTransaction.mockResolvedValue({ 
      hash: 'testhash', 
      ledger: 123, 
      status: 'SUCCESS' 
    });
    mockRedis.get.mockResolvedValue(null);
  });

  describe('Transaction Validation', () => {
    it('rejects empty XDR', async () => {
      const svc = makeService();
      await expect(svc.sponsor({ transaction: '', network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ValidationError);
    });

    it('rejects garbage string', async () => {
      const svc = makeService();
      await expect(svc.sponsor({ transaction: 'not-base64-garbage!', network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ValidationError);
    });

    it('rejects unsigned transaction', async () => {
      const svc = makeService();
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.payment({
          destination: Keypair.random().publicKey(),
          amount: '1',
          asset: Asset.native(),
        }))
        .setTimeout(100)
        .build();

      await expect(svc.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Transaction must be signed by the source account');
    });

    it('rejects transaction where source is a channel account', async () => {
      const svc = makeService();
      const tx = new TransactionBuilder(
        new Account(mockChannel.publicKey, '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.payment({
          destination: Keypair.random().publicKey(),
          amount: '1',
          asset: Asset.native(),
        }))
        .setTimeout(100)
        .build();
      tx.sign(mockChannel.keypair);

      await expect(svc.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Channel accounts cannot be used as inner transaction sources');
    });

    it('rejects accountMerge targeting a channel', async () => {
      const svc = makeService();
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.accountMerge({ destination: mockChannel.publicKey }))
        .setTimeout(100)
        .build();
      tx.sign(userKeypair);

      await expect(svc.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Channel accounts cannot be merged into other accounts');
    });
  });

  describe('Channel Management', () => {
    it('throws ChannelExhaustedError when no channels are available', async () => {
      (mockChannelManager.acquire as any).mockResolvedValue(null);
      const svc = makeService();
      const tx = buildSignedTx(userKeypair);
      await expect(svc.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ChannelExhaustedError);
    });

    it('always releases channel even if submission fails', async () => {
      mockStellarClient.submitTransaction.mockRejectedValue(new Error('Network error'));
      const svc = makeService();
      const tx = buildSignedTx(userKeypair);

      await expect(svc.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow();

      expect(mockChannelManager.release).toHaveBeenCalledWith(mockChannel.publicKey);
    });
  });

  describe('Idempotency', () => {
    it('returns cached result for same idempotency key', async () => {
      const cachedResult = { hash: 'cached-hash', ledger: 123, feePaid: '1000', network: 'testnet', channelAccount: 'GCHAN' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const svc = makeService();
      const result = await svc.checkIdempotency('key-1', 'api-1');
      expect(result).toEqual(cachedResult);
    });
  });
});
