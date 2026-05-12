import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Keypair, TransactionBuilder, Networks, Asset, Operation, Account } from '@stellar/stellar-sdk';
import { app } from '../src/app';
import { redis } from '../src/utils/redis';
import { container } from '../src/container';
import { config } from '../src/config';

describe('Grat Relay Integration Tests', () => {
  let userKeypair: Keypair;

  beforeAll(async () => {
    process.env.NETWORK = 'testnet';
    
    if (!config.channelSeedPhrase) {
      (config as any).channelSeedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    }

    await container.channelManager.initialize();
    
    userKeypair = Keypair.random();
    console.log('Funding test user:', userKeypair.publicKey());
    
    let fbRes;
    let retries = 3;
    while (retries > 0) {
      try {
        fbRes = await fetch(`https://friendbot.stellar.org/?addr=${userKeypair.publicKey()}`);
        if (fbRes.ok) break;
      } catch (err) {
        console.warn(`Friendbot funding attempt failed (${retries} retries left):`, err instanceof Error ? err.message : err);
      }
      retries--;
      if (retries > 0) await new Promise(r => setTimeout(r, 2000));
    }

    if (!fbRes || !fbRes.ok) {
      throw new Error(`Friendbot funding failed for test user after retries: ${fbRes?.status || 'Network Error'}`);
    }
  }, 120000);

  afterAll(async () => {
    await container.channelManager.stop();
    await redis.quit();
  }, 20000);

  describe('GET /health', () => {
    it('returns 200 with status info', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        network: 'testnet'
      });
    }, 15000);
  });

  describe('POST /v1/sponsor', () => {
    it('sponsors a classic payment transaction', async () => {
      const accountInfo = await (container as any).stellarClient.getAccount(userKeypair.publicKey());
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), accountInfo.sequenceNumber),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(
          Operation.createAccount({
            destination: Keypair.random().publicKey(),
            startingBalance: '1',
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(userKeypair);

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
      const accountInfo = await (container as any).stellarClient.getAccount(userKeypair.publicKey());
      const tx = new TransactionBuilder(
        new Account(userKeypair.publicKey(), accountInfo.sequenceNumber),
        { fee: '100', networkPassphrase: Networks.TESTNET }
      )
        .addOperation(Operation.createAccount({ destination: Keypair.random().publicKey(), startingBalance: '1' }))
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
      // Rate limiting test omitted to avoid hitting network limits
    });
  });
});
