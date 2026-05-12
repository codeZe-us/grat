import crypto from 'crypto';
import { Knex } from 'knex';
import { Logger } from 'pino';
import { generateRandomString, generateSalt, hashKey } from '../../utils/crypto';
import { NotFoundError } from '../../utils/errors';
import { getErrorMessage } from '../../utils/error-guards';

export interface KeyCreateRequest {
  email: string;
  name: string;
  network: 'mainnet' | 'testnet';
}

export interface ApiKeyRecord {
  id: string;
  developer_id: string;
  key_hash: string;
  key_salt: string;
  key_prefix: string;
  network: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  daily_spending_cap_stroops: string;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
}

export interface KeyResponse {
  rawKey?: string;
  prefix: string;
  network: string;
  rateLimit: number;
  dailySpendingCap: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt?: Date | null;
}

export class KeysService {
  constructor(
    private readonly db: Knex,
    private readonly logger: Logger
  ) {}

  async createKey(data: KeyCreateRequest): Promise<KeyResponse> {
    const { email, name, network } = data;

    try {
      let developer = await this.db('developers').where({ email }).first();
      if (!developer) {
        const [newDeveloper] = await this.db('developers')
          .insert({ email, name })
          .returning('*');
        developer = newDeveloper;
      }

      const prefix = network === 'mainnet' ? 'sr_live_' : 'sr_test_';
      const randomPart = generateRandomString(32);
      const rawKey = `${prefix}${randomPart}`;
      
      const salt = generateSalt();
      const hash = hashKey(rawKey, salt);
      const keyPrefix = rawKey.substring(0, 12);

      const [apiKey] = await this.db('api_keys')
        .insert({
          developer_id: developer.id,
          key_hash: hash,
          key_salt: salt,
          key_prefix: keyPrefix,
          network: network,
          is_active: true,
        })
        .returning('*');

      return {
        rawKey,
        prefix: apiKey.key_prefix,
        network: apiKey.network,
        rateLimit: apiKey.rate_limit_per_minute,
        dailySpendingCap: apiKey.daily_spending_cap_stroops,
        isActive: apiKey.is_active,
        createdAt: apiKey.created_at,
        lastUsedAt: apiKey.last_used_at,
      };
    } catch (err: unknown) {
      this.logger.error({ msg: 'Database error in createKey', err: getErrorMessage(err) });
      throw err;
    }
  }

  async listKeys(email: string): Promise<KeyResponse[]> {
    try {
      const developer = await this.db('developers').where({ email }).first();
      if (!developer) {
        throw new NotFoundError('Developer not found');
      }

      const keys = await this.db('api_keys')
        .where({ developer_id: developer.id })
        .orderBy('created_at', 'desc');

      return keys.map((key) => ({
        prefix: key.key_prefix,
        network: key.network,
        isActive: key.is_active,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at,
        rateLimit: key.rate_limit_per_minute,
        dailySpendingCap: key.daily_spending_cap_stroops,
      }));
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      this.logger.error({ msg: 'Database error in listKeys', err: getErrorMessage(err) });
      throw err;
    }
  }

  async rotateKey(prefix: string): Promise<KeyResponse> {
    try {
      const oldKey = await this.db('api_keys').where({ key_prefix: prefix, is_active: true }).first();
      if (!oldKey) {
        throw new NotFoundError('Active key with this prefix not found');
      }

      const networkPrefix = oldKey.network === 'mainnet' ? 'sr_live_' : 'sr_test_';
      const randomPart = generateRandomString(32);
      const newRawKey = `${networkPrefix}${randomPart}`;
      
      const salt = generateSalt();
      const hash = hashKey(newRawKey, salt);
      const newKeyPrefix = newRawKey.substring(0, 12);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.db('api_keys')
        .where({ id: oldKey.id })
        .update({ expires_at: expiresAt });

      const [apiKey] = await this.db('api_keys')
        .insert({
          developer_id: oldKey.developer_id,
          key_hash: hash,
          key_salt: salt,
          key_prefix: newKeyPrefix,
          network: oldKey.network,
          is_active: true,
        })
        .returning('*');

      return {
        rawKey: newRawKey,
        prefix: apiKey.key_prefix,
        network: apiKey.network,
        rateLimit: apiKey.rate_limit_per_minute,
        dailySpendingCap: apiKey.daily_spending_cap_stroops,
        isActive: apiKey.is_active,
        createdAt: apiKey.created_at,
        lastUsedAt: apiKey.last_used_at,
      };
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      this.logger.error({ msg: 'Database error in rotateKey', err: getErrorMessage(err) });
      throw err;
    }
  }

  async revokeKey(prefix: string): Promise<void> {
    try {
      const result = await this.db('api_keys')
        .where({ key_prefix: prefix })
        .update({ is_active: false });

      if (result === 0) {
        throw new NotFoundError('Key not found');
      }
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      this.logger.error({ msg: 'Database error in revokeKey', err: getErrorMessage(err) });
      throw err;
    }
  }

  async validateKey(rawKey: string): Promise<ApiKeyRecord | null> {
    try {
      const prefix = rawKey.substring(0, 12);
      const key = await this.db('api_keys').where({ key_prefix: prefix, is_active: true }).first();

      if (!key) return null;

      const computedHash = hashKey(rawKey, key.key_salt);
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedHash),
        Buffer.from(key.key_hash)
      );

      if (!isValid) return null;

      if (key.expires_at && new Date() > key.expires_at) {
        return null;
      }

      return key;
    } catch (err: unknown) {
      this.logger.error({ msg: 'Database error in validateKey', err: getErrorMessage(err) });
      return null;
    }
  }
}
