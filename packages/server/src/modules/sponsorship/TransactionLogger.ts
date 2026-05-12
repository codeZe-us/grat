import { Knex } from 'knex';
import { Logger } from 'pino';
import { getErrorMessage } from '../../utils/error-guards';

export interface TransactionRecord {
  apiKeyId?: string;
  transactionHash: string;
  channelAccount: string;
  innerSourceAccount: string;
  feePaidStroops: string;
  network: string;
  operationsCount: number;
  isSoroban: boolean;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export class TransactionLogger {
  constructor(
    private readonly db: Knex,
    private readonly logger: Logger
  ) {}

  async log(record: TransactionRecord) {
    try {
      await this.db('sponsored_transactions').insert({
        api_key_id: record.apiKeyId,
        transaction_hash: record.transactionHash,
        channel_account: record.channelAccount,
        inner_source_account: record.innerSourceAccount,
        fee_paid_stroops: record.feePaidStroops,
        network: record.network,
        operations_count: record.operationsCount,
        is_soroban: record.isSoroban,
        status: record.status,
        error_message: record.errorMessage,
        created_at: this.db.fn.now(),
      });
    } catch (err: unknown) {
      this.logger.error({ 
        msg: 'Failed to log transaction to database', 
        err: getErrorMessage(err),
        hash: record.transactionHash 
      });
    }
  }
}
