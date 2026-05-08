import db from '../../database/knex';
import { logger } from '../../utils/logger';

export class KeysWorker {
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs: number = 60 * 60 * 1000) {
    this.interval = setInterval(() => this.deactivateExpiredKeys(), intervalMs);
    logger.info('KeysWorker started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async deactivateExpiredKeys() {
    try {
      const now = new Date();
      const deactivatedCount = await db('api_keys')
        .where('is_active', true)
        .where('expires_at', '<', now)
        .update({ is_active: false });

      if (deactivatedCount > 0) {
        logger.info({ deactivatedCount }, 'Deactivated expired API keys');
      }
    } catch (err) {
      logger.error({ msg: 'Failed to deactivate expired keys', err });
    }
  }
}

export const keysWorker = new KeysWorker();
