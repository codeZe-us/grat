import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sponsorshipService } from '../src/modules/sponsorship/SponsorshipService';
import { channelManager } from '../src/modules/channels/ChannelManager';
import { creditService } from '../src/modules/sponsorship/CreditService';
import { Keypair, TransactionBuilder, Networks, Operation, Account } from '@stellar/stellar-sdk';
import { ValidationError, SubmissionFailedError, ChannelExhaustedError } from '../src/utils/errors';

vi.mock('../src/modules/channels/ChannelManager');
vi.mock('../src/modules/sponsorship/CreditService');
vi.mock('../src/utils/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  }
}));

describe('SponsorshipService Unit Tests', () => {
  const mockChannel = {
    publicKey: 'GCHANNEL...',
    keypair: Keypair.random(),
    status: 'available',
  };

  const userKeypair = Keypair.random();
  const networkPassphrase = Networks.TESTNET;

  beforeEach(() => {
    vi.clearAllMocks();
    (channelManager.acquire as any).mockResolvedValue(mockChannel);
    (channelManager.isChannelAccount as any).mockImplementation((pk: string) => pk === mockChannel.publicKey);
  });

  describe('Transaction Validation', () => {
    it('rejects empty XDR', async () => {
      await expect(sponsorshipService.sponsor({ transaction: '', network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ValidationError);
    });

    it('rejects garbage string', async () => {
      await expect(sponsorshipService.sponsor({ transaction: 'not-base64-garbage!', network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ValidationError);
    });

    it('rejects unsigned transaction', async () => {
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), amount: '1', asset: (Operation.payment as any).native }))
        .setTimeout(100)
        .build();

      await expect(sponsorshipService.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Transaction must be signed by the source account');
    });

    it('rejects transaction where source is a channel account', async () => {
      const tx = new TransactionBuilder(
        new Account(mockChannel.publicKey, '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), amount: '1', asset: (Operation.payment as any).native }))
        .setTimeout(100)
        .build();
      tx.sign(mockChannel.keypair);

      await expect(sponsorshipService.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Channel accounts cannot be used as inner transaction sources');
    });

    it('rejects accountMerge targeting a channel', async () => {
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase }
      )
        .addOperation(Operation.accountMerge({ destination: mockChannel.publicKey }))
        .setTimeout(100)
        .build();
      tx.sign(userKeypair);

      await expect(sponsorshipService.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow('Channel accounts cannot be merged into other accounts');
    });
  });

  describe('Channel Management', () => {
    it('throws ChannelExhaustedError when no channels are available', async () => {
      (channelManager.acquire as any).mockResolvedValue(null);
      
      const tx = new TransactionBuilder(new Account(userKeypair.publicKey(), '1'), { fee: '100', networkPassphrase })
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), amount: '1', asset: (Operation.payment as any).native }))
        .setTimeout(100).build();
      tx.sign(userKeypair);

      await expect(sponsorshipService.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow(ChannelExhaustedError);
    });

    it('always releases channel even if submission fails', async () => {
      const tx = new TransactionBuilder(new Account(userKeypair.publicKey(), '1'), { fee: '100', networkPassphrase })
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), amount: '1', asset: (Operation.payment as any).native }))
        .setTimeout(100).build();
      tx.sign(userKeypair);

 
      (sponsorshipService as any).horizon = {
        feeStats: vi.fn().mockResolvedValue({ fee_charged: { p70: '100' } }),
        submitTransaction: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      await expect(sponsorshipService.sponsor({ transaction: tx.toXDR(), network: 'testnet' }, 'req-1'))
        .rejects.toThrow();

      expect(channelManager.release).toHaveBeenCalledWith(mockChannel.publicKey);
    });
  });

  describe('Idempotency', () => {
    it('returns cached result for same idempotency key', async () => {
      const cachedResult = { hash: 'cached-hash', ledger: 123, feePaid: '1000' };
      const redis = require('../src/utils/redis').redis;
      redis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await sponsorshipService.checkIdempotency('key-1', 'api-1');
      expect(result).toEqual(cachedResult);
    });
  });
});
