import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.specificType('operation_types', 'text[]').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sponsored_transactions', (table) => {
    table.specificType('operation_types', 'text[]').notNullable().alter();
  });
}
