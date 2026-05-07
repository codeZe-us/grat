import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export async function seed(knex: Knex): Promise<void> {
  await knex('credit_deposits').del();
  await knex('sponsored_transactions').del();
  await knex('credit_balances').del();
  await knex('api_keys').del();
  await knex('developers').del();

  const developerId = uuidv4();
  const apiKeyId = uuidv4();

  await knex('developers').insert([
    {
      id: developerId,
      email: 'dev@grat.network',
      name: 'Grat Developer',
    },
  ]);

  const rawKey = 'gr_live_testkey1234567890';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(rawKey + salt).digest('hex');
  const prefix = rawKey.substring(0, 12);

  await knex('api_keys').insert([
    {
      id: apiKeyId,
      developer_id: developerId,
      key_hash: hash,
      key_salt: salt,
      key_prefix: prefix,
      network: 'testnet',
      is_active: true,
      rate_limit_per_minute: 100,
      daily_spending_cap_stroops: '10000000000',
    },
  ]);

  await knex('credit_balances').insert([
    {
      id: uuidv4(),
      api_key_id: apiKeyId,
      balance_stroops: '1000000000',
      total_deposited_stroops: '1000000000',
      total_spent_stroops: '0',
    },
  ]);

  console.log('Seed data created successfully');
}
