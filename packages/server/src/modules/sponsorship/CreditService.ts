import db from '../../database/knex';
import { InsufficientCreditsError, PolicyDeniedError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class CreditService {
  /**
   * Deducts credits optimistically and checks daily spending cap.
   * Uses a database transaction and SELECT FOR UPDATE.
   */
  async placeHold(apiKeyId: string, amountStroops: bigint): Promise<void> {
    await db.transaction(async (trx) => {
      const key = await trx('api_keys')
        .where({ id: apiKeyId })
        .first();

      const balance = await trx('credit_balances')
        .where({ api_key_id: apiKeyId })
        .forUpdate()
        .first();

      if (!balance || !key) {
        throw new InsufficientCreditsError('Credit balance record not found');
      }

      const now = new Date();
      const lastReset = new Date(balance.last_reset_at);
      let spentToday = BigInt(balance.spent_today_stroops);

      if (now.getUTCDate() !== lastReset.getUTCDate() || 
          now.getUTCMonth() !== lastReset.getUTCMonth() || 
          now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
        spentToday = 0n;
        await trx('credit_balances')
          .where({ id: balance.id })
          .update({ spent_today_stroops: '0', last_reset_at: now });
      }

      const dailyCap = BigInt(key.daily_spending_cap_stroops);
      if (spentToday + amountStroops > dailyCap) {
        throw new PolicyDeniedError('Daily spending limit reached', { 
          spentToday: spentToday.toString(), 
          cap: dailyCap.toString() 
        });
      }

      const currentBalance = BigInt(balance.balance_stroops);
      if (currentBalance < amountStroops) {
        throw new InsufficientCreditsError();
      }

      const newBalance = currentBalance - amountStroops;
      const totalSpent = BigInt(balance.total_spent_stroops) + amountStroops;
      const newSpentToday = spentToday + amountStroops;

      await trx('credit_balances')
        .where({ id: balance.id })
        .update({
          balance_stroops: newBalance.toString(),
          total_spent_stroops: totalSpent.toString(),
          spent_today_stroops: newSpentToday.toString(),
          updated_at: trx.fn.now(),
        });

      if (newSpentToday * 10n >= dailyCap * 8n) {
        logger.warn({ apiKeyId, spentToday: newSpentToday.toString(), cap: dailyCap.toString() }, 'Daily spending cap at 80%+');
      }

      logger.debug({ apiKeyId, amountStroops: amountStroops.toString(), newBalance: newBalance.toString() }, 'Credits held');
    });
  }

  /**
   * Adjusts the held amount to the actual fee paid.
   */
  async confirmDeduction(apiKeyId: string, heldAmount: bigint, actualAmount: bigint): Promise<void> {
    if (heldAmount === actualAmount) return;

    const diff = heldAmount - actualAmount;
    if (diff > 0n) {
      await this.refundCredits(apiKeyId, diff);
    } else {
      const additional = actualAmount - heldAmount;
      await this.deductCredits(apiKeyId, additional);
    }
  }

  /**
   * Releases the held credits (e.g., if submission failed).
   */
  async releaseHold(apiKeyId: string, amountStroops: bigint): Promise<void> {
    await this.refundCredits(apiKeyId, amountStroops);
  }

  /**
   * Deducts credits from an API key's balance atomically.
   */
  async deductCredits(apiKeyId: string, amountStroops: bigint): Promise<void> {
    await db.transaction(async (trx) => {
      const balance = await trx('credit_balances')
        .where({ api_key_id: apiKeyId })
        .forUpdate()
        .first();

      if (!balance) return;

      const currentBalance = BigInt(balance.balance_stroops);
      const newBalance = currentBalance - amountStroops;
      const totalSpent = BigInt(balance.total_spent_stroops) + amountStroops;
      const spentToday = BigInt(balance.spent_today_stroops) + amountStroops;

      await trx('credit_balances')
        .where({ api_key_id: apiKeyId })
        .update({
          balance_stroops: newBalance.toString(),
          total_spent_stroops: totalSpent.toString(),
          spent_today_stroops: spentToday.toString(),
          updated_at: trx.fn.now(),
        });
    });
  }

  /**
   * Refunds credits to an API key's balance.
   */
  async refundCredits(apiKeyId: string, amountStroops: bigint): Promise<void> {
    await db.transaction(async (trx) => {
      const balance = await trx('credit_balances')
        .where({ api_key_id: apiKeyId })
        .forUpdate()
        .first();

      if (!balance) return;

      const newBalance = BigInt(balance.balance_stroops) + amountStroops;
      const totalSpent = BigInt(balance.total_spent_stroops) - amountStroops;
      const spentToday = BigInt(balance.spent_today_stroops) - amountStroops;

      await trx('credit_balances')
        .where({ api_key_id: apiKeyId })
        .update({
          balance_stroops: newBalance.toString(),
          total_spent_stroops: totalSpent.toString(),
          spent_today_stroops: spentToday.toString(),
          updated_at: trx.fn.now(),
        });

      logger.debug({ apiKeyId, refundAmount: amountStroops.toString() }, 'Credits refunded');
    });
  }

  async getBalance(apiKeyId: string) {
    const balance = await db('credit_balances').where({ api_key_id: apiKeyId }).first();
    return balance;
  }
}

export const creditService = new CreditService();
