import { Redis } from 'ioredis';
import { Knex } from 'knex';
import { Logger } from 'pino';
import { StellarClient } from '../stellar/stellar-client';
import { getErrorMessage } from '../utils/error-guards';

export interface DepositPollerConfig {
  depositPollIntervalMs?: number;
  depositAddress?: string;
}

export class DepositPoller {
  private interval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollCount = 0;

  constructor(
    private readonly stellarClient: StellarClient,
    private readonly db: Knex,
    private readonly redis: Redis,
    private readonly config: DepositPollerConfig,
    private readonly logger: Logger
  ) {}

  async start() {
    const intervalMs = this.config.depositPollIntervalMs || 5000;
    this.interval = setInterval(() => this.poll(), intervalMs);
    this.logger.info(`DepositPoller started with ${intervalMs}ms interval`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.logger.info('DepositPoller stopped');
  }

  private async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const depositAddress = this.config.depositAddress;
      if (!depositAddress) {
        return;
      }

      const cursor = await this.redis.get('deposit:cursor');
      this.logger.debug({ cursor }, 'Polling for deposits...');
      
      this.pollCount++;
      if (this.pollCount >= 100) {
        await this.persistCursor(cursor);
        this.pollCount = 0;
      }
    } catch (err) {
      this.logger.error({ msg: 'Error in deposit poller', err: getErrorMessage(err) });
    } finally {
      this.isPolling = false;
    }
  }

  private async persistCursor(cursor: string | null) {
    if (!cursor) return;
    try {
      await this.db('system_settings').insert({
        key: 'deposit_cursor',
        value: cursor,
        updated_at: this.db.fn.now()
      }).onConflict('key').merge();
    } catch (err) {
      this.logger.error({ msg: 'Failed to persist cursor to DB', err: getErrorMessage(err) });
    }
  }

  private async processTransaction(tx: {
    memo?: string;
    hash: string;
    operations: Array<{
      type: string;
      asset_type?: string;
      destination?: string;
      amount?: string;
      from?: string;
    }>;
  }) {
    const memo = tx.memo;
    if (!memo) return;

    const apiKey = await this.db('api_keys')
      .where('key_prefix', memo)
      .first();

    if (!apiKey) {
      this.logger.debug({ memo }, 'No API key found for memo prefix');
      return;
    }

    for (const op of tx.operations) {
      if (op.type === 'payment' && op.asset_type === 'native' && op.destination === this.config.depositAddress) {
        const amount = op.amount ?? '0';
        const from = op.from ?? '';
        const amountStroops = BigInt(parseFloat(amount) * 10_000_000);
        await this.creditBalance(apiKey.id, amountStroops, tx.hash, from, memo);
      }
    }
  }

  private async creditBalance(apiKeyId: string, amountStroops: bigint, txHash: string, source: string, memo: string) {
    try {
      await this.db.transaction(async (trx) => {
        const existing = await trx('credit_deposits')
          .where({ stellar_tx_hash: txHash })
          .first();

        if (existing) return;

        await trx('credit_deposits').insert({
          api_key_id: apiKeyId,
          amount_stroops: amountStroops.toString(),
          source_stellar_address: source,
          stellar_tx_hash: txHash,
          memo,
          status: 'confirmed'
        });

        const balance = await trx('credit_balances')
          .where({ api_key_id: apiKeyId })
          .forUpdate()
          .first();

        if (balance) {
          const newBalance = BigInt(balance.balance_stroops) + amountStroops;
          const newTotal = BigInt(balance.total_deposited_stroops) + amountStroops;
          
          await trx('credit_balances')
            .where({ id: balance.id })
            .update({
              balance_stroops: newBalance.toString(),
              total_deposited_stroops: newTotal.toString(),
              updated_at: trx.fn.now()
            });
        }

        this.logger.info({ apiKeyId, amountStroops: amountStroops.toString(), txHash }, 'Credited deposit to account');
      });
    } catch (err) {
      this.logger.error({ msg: 'Failed to credit deposit', apiKeyId, txHash, err: getErrorMessage(err) });
    }
  }
}
