import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.renameColumn('tx_hash', 'transaction_hash');
    table.renameColumn('source_account', 'inner_source_account');
    
    table.integer('operations_count').defaultTo(0);
    table.boolean('is_soroban').defaultTo(false);
    table.text('error_message').nullable();
    
    table.dropColumn('error_details');
  });

  await knex.raw('ALTER TABLE sponsored_transactions ALTER COLUMN status TYPE TEXT');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.renameColumn('transaction_hash', 'tx_hash');
    table.renameColumn('inner_source_account', 'source_account');
    table.dropColumn('operations_count');
    table.dropColumn('is_soroban');
    table.dropColumn('error_message');
    table.jsonb('error_details').nullable();
  });
}
