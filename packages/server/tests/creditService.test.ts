import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { CreditService } from '../src/modules/sponsorship/CreditService';
import db from '../src/database/knex';
import { resetDatabase, createTestData } from './db-helper';
import { InsufficientCreditsError, PolicyDeniedError } from '../src/utils/errors';
import pino from 'pino';

const mockLogger = pino({ level: 'silent' });
const mockRedis: any = { get: () => null, set: () => null };
const creditService = new CreditService(db, mockRedis, mockLogger);

describe('CreditService Unit Tests', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('Basic Operations', () => {
    it('starts with 0 balance', async () => {
      const { apiKey } = await createTestData();
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('0');
    });

    it('adds credits correctly', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '1000' });
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('1000');
    });

    it('deducts credits correctly', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '1000' });
      
      await creditService.deductCredits(apiKey.id, 400n);
      const balance = await creditService.getBalance(apiKey.id);
      
      expect(balance.balance_stroops).toBe('600');
      expect(balance.total_spent_stroops).toBe('400');
    });

    it('never goes below 0 (placeHold check)', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '100' });
      
      await expect(creditService.placeHold(apiKey.id, 101n)).rejects.toThrow(InsufficientCreditsError);
    });
  });

  describe('Concurrency & Atomicity', () => {
    it('10 concurrent requests at 90% cost: only 1 succeeds', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '1000' });

      const results = await Promise.allSettled(
        Array.from({ length: 10 }).map(() => creditService.placeHold(apiKey.id, 900n))
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(9);

      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('100');
      expect(balance.total_spent_stroops).toBe('900');
    });

    it('5 concurrent requests at 30% cost: exactly 3 succeed', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '1000' });

      const results = await Promise.allSettled(
        Array.from({ length: 5 }).map(() => creditService.placeHold(apiKey.id, 300n))
      );

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(3);

      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('100');
    });
  });

  describe('Hold and Release / Confirmation', () => {
    it('refunds difference when actual fee < held amount', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '2000' });

      await creditService.placeHold(apiKey.id, 1000n);
      await creditService.confirmDeduction(apiKey.id, 1000n, 800n);
      
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('1200');
      expect(balance.total_spent_stroops).toBe('800');
    });

    it('deducts more when actual fee > held amount', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '2000' });

      await creditService.placeHold(apiKey.id, 1000n);
      await creditService.confirmDeduction(apiKey.id, 1000n, 1200n);
      
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('800');
      expect(balance.total_spent_stroops).toBe('1200');
    });

    it('restores all credits on releaseHold', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '2000' });

      await creditService.placeHold(apiKey.id, 1000n);
      await creditService.releaseHold(apiKey.id, 1000n);
      
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.balance_stroops).toBe('2000');
      expect(balance.total_spent_stroops).toBe('0');
    });
  });

  describe('Daily Spending Cap', () => {
    it('blocks request when daily cap is reached', async () => {
      const { apiKey } = await createTestData();
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ balance_stroops: '20000000' });

      // Spend 9,000,000
      await creditService.placeHold(apiKey.id, 9000000n);
      
      // Next 2,000,000 should fail
      await expect(creditService.placeHold(apiKey.id, 2000000n)).rejects.toThrow(PolicyDeniedError);
    });

    it('resets spending after midnight UTC', async () => {
      const { apiKey } = await createTestData();
      
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      
      await db('credit_balances').where({ api_key_id: apiKey.id }).update({ 
        balance_stroops: '20000000',
        spent_today_stroops: '9000000',
        last_reset_at: yesterday
      });

      // Next 2,000,000 should succeed because it triggers reset
      await creditService.placeHold(apiKey.id, 2000000n);
      
      const balance = await creditService.getBalance(apiKey.id);
      expect(balance.spent_today_stroops).toBe('2000000');
    });
  });
});
