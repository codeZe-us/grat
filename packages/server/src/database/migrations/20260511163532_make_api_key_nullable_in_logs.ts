import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.uuid('api_key_id').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.uuid('api_key_id').notNullable().alter();
  });
}
