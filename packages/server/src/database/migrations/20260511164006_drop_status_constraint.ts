import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE sponsored_transactions DROP CONSTRAINT IF EXISTS sponsored_transactions_status_check');
}

export async function down(_knex: Knex): Promise<void> {
}
