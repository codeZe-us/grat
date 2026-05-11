import db from '../src/database/knex';

export async function resetDatabase() {
  await db('sponsored_transactions').del();
  await db('credit_deposits').del();
  await db('credit_balances').del();
  await db('api_keys').del();
  await db('developers').del();
}

export async function createTestData() {
  const [developer] = await db('developers').insert({
    email: 'test@example.com',
    name: 'Test Developer'
  }).returning('*');

  const [apiKey] = await db('api_keys').insert({
    developer_id: developer.id,
    key_hash: 'dummy_hash',
    key_salt: 'dummy_salt',
    key_prefix: 'grat_test',
    network: 'testnet',
    daily_spending_cap_stroops: '10000000' // 1 XLM
  }).returning('*');

  const [balance] = await db('credit_balances').insert({
    api_key_id: apiKey.id,
    balance_stroops: '0',
    total_deposited_stroops: '0',
    total_spent_stroops: '0',
    spent_today_stroops: '0',
    last_reset_at: db.fn.now()
  }).returning('*');

  return { developer, apiKey, balance };
}
