import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('credit_balances', (table) => {
    table.bigInteger('spent_today_stroops').defaultTo('0');
    table.timestamp('last_reset_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('credit_balances', (table) => {
    table.dropColumn('spent_today_stroops');
    table.dropColumn('last_reset_at');
  });
}
