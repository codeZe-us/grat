import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('developers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('name').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('developer_id').references('id').inTable('developers').onDelete('CASCADE').notNullable();
    table.string('key_hash').notNullable();
    table.string('key_salt').notNullable();
    table.string('key_prefix', 12).notNullable();
    table.enum('network', ['mainnet', 'testnet']).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('rate_limit_per_minute').defaultTo(100);
    table.bigInteger('daily_spending_cap_stroops').defaultTo('10000000000');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable();
    table.timestamp('last_used_at').nullable();

    table.index('key_hash');
    table.index('key_prefix');
    table.index('developer_id');
  });

  await knex.schema.createTable('credit_balances', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('CASCADE').unique().notNullable();
    table.bigInteger('balance_stroops').defaultTo('0');
    table.bigInteger('total_deposited_stroops').defaultTo('0');
    table.bigInteger('total_spent_stroops').defaultTo('0');
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('api_key_id');
  });

  await knex.schema.createTable('sponsored_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('CASCADE').notNullable();
    table.string('tx_hash').notNullable();
    table.string('source_account').notNullable();
    table.bigInteger('fee_paid_stroops').notNullable();
    table.specificType('operation_types', 'text[]').notNullable();
    table.enum('status', ['submitted', 'confirmed', 'failed']).notNullable();
    table.enum('network', ['mainnet', 'testnet']).notNullable();
    table.string('channel_account').notNullable();
    table.jsonb('error_details').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('confirmed_at').nullable();

    table.index('api_key_id');
    table.index('tx_hash');
    table.index('created_at');
  });

  await knex.schema.createTable('credit_deposits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('CASCADE').notNullable();
    table.bigInteger('amount_stroops').notNullable();
    table.string('source_stellar_address').notNullable();
    table.string('stellar_tx_hash').notNullable();
    table.string('memo').notNullable();
    table.enum('status', ['pending', 'confirmed', 'failed']).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('api_key_id');
  });

  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_developers_updated_at BEFORE UPDATE ON developers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON credit_balances FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('credit_deposits');
  await knex.schema.dropTableIfExists('sponsored_transactions');
  await knex.schema.dropTableIfExists('credit_balances');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('developers');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column CASCADE');
}
