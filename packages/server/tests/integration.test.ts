import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Keypair, TransactionBuilder, Networks, Asset, Operation, Account } from '@stellar/stellar-sdk';
import { app } from '../src/app';
import { redis } from '../src/utils/redis';
import { channelManager } from '../src/modules/channels/ChannelManager';

describe('Grat Relay Integration Tests', () => {
  let userKeypair: Keypair;

  beforeAll(async () => {
    // Ensure we are on testnet for tests
    process.env.NETWORK = 'testnet';
    
    // Initialize channels (will fund via Friendbot if needed)
    await channelManager.initialize();
    
    // Create and fund a test user
    userKeypair = Keypair.random();
    console.log('Funding test user:', userKeypair.publicKey());
    await fetch(`https://friendbot.stellar.org/?addr=${userKeypair.publicKey()}`);
  }, 60000); // Long timeout for Friendbot/Horizon

  afterAll(async () => {
    await channelManager.stop();
    await redis.quit();
  });

  describe('GET /health', () => {
    it('returns 200 with status info', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        network: 'testnet'
      });
    });
  });

  describe('POST /v1/sponsor', () => {
    it('sponsors a classic payment transaction', async () => {
      // 1. Build a simple payment
      const accountInfo = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${userKeypair.publicKey()}`)).json();
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), accountInfo.sequence),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(
          Operation.payment({
            destination: Keypair.random().publicKey(),
            asset: Asset.native(),
            amount: '1',
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(userKeypair);

      // 2. Submit to relay
      const res = await request(app)
        .post('/v1/sponsor')
        .send({
          transaction: tx.toXDR(),
          network: 'testnet'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hash');
      expect(res.body).toHaveProperty('ledger');
    }, 60000);

    it('returns identical response for the same idempotency key', async () => {
      const accountInfo = await (await fetch(`https://horizon-testnet.stellar.org/accounts/${userKeypair.publicKey()}`)).json();
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), accountInfo.sequence),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '0.1' }))
        .setTimeout(30)
        .build();
      tx.sign(userKeypair);

      const idempotencyKey = `test-${Date.now()}`;
      
      const res1 = await request(app)
        .post('/v1/sponsor')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ transaction: tx.toXDR() });

      const res2 = await request(app)
        .post('/v1/sponsor')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ transaction: tx.toXDR() });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.hash).toBe(res2.body.hash);
    }, 60000);

    it('returns 400 for unsigned transaction', async () => {
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
        .setTimeout(30)
        .build();

      const res = await request(app)
        .post('/v1/sponsor')
        .send({ transaction: tx.toXDR() });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/estimate', () => {
    it('returns fee estimate for classic transaction', async () => {
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), '1'),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
        .setTimeout(30)
        .build();

      const res = await request(app)
        .post('/v1/estimate')
        .send({ transaction: tx.toXDR() });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('estimatedFee');
      expect(res.body.breakdown).toHaveProperty('baseFee');
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 when minute limit is exceeded', async () => {
      // Rate limiting test omitted to avoid hitting Horizon limits
    });
  });
});
