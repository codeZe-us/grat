import { Knex } from 'knex';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { InsufficientCreditsError, PolicyDeniedError } from '../../utils/errors';
import { getErrorMessage } from '../../utils/error-guards';

export class CreditService {
  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
    private readonly logger: Logger
  ) {}

  async placeHold(apiKeyId: string, amountStroops: bigint): Promise<void> {
    try {
      await this.db.transaction(async (trx) => {
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
          this.logger.warn({ apiKeyId, spentToday: newSpentToday.toString(), cap: dailyCap.toString() }, 'Daily spending cap at 80%+');
        }

        this.logger.debug({ apiKeyId, amountStroops: amountStroops.toString(), newBalance: newBalance.toString() }, 'Credits held');
      });
    } catch (err: unknown) {
      if (err instanceof InsufficientCreditsError || err instanceof PolicyDeniedError) throw err;
      this.logger.error({ msg: 'Database error during credit hold', err: getErrorMessage(err) });
      throw err;
    }
  }

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

  async releaseHold(apiKeyId: string, amountStroops: bigint): Promise<void> {
    await this.refundCredits(apiKeyId, amountStroops);
  }

  async deductCredits(apiKeyId: string, amountStroops: bigint): Promise<void> {
    try {
      await this.db.transaction(async (trx) => {
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
    } catch (err: unknown) {
      this.logger.error({ msg: 'Database error during credit deduction', err: getErrorMessage(err) });
      throw err;
    }
  }

  async refundCredits(apiKeyId: string, amountStroops: bigint): Promise<void> {
    try {
      await this.db.transaction(async (trx) => {
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

        this.logger.debug({ apiKeyId, refundAmount: amountStroops.toString() }, 'Credits refunded');
      });
    } catch (err: unknown) {
      this.logger.error({ msg: 'Database error during credit refund', err: getErrorMessage(err) });
      throw err;
    }
  }

  async getBalance(apiKeyId: string) {
    try {
      const balance = await this.db('credit_balances').where({ api_key_id: apiKeyId }).first();
      return balance;
    } catch (err: unknown) {
      this.logger.error({ msg: 'Database error during getBalance', err: getErrorMessage(err) });
      throw err;
    }
  }
}
