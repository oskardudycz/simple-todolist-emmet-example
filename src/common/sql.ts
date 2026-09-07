import knex from 'knex';

/**
 * Query builder only - it is configured without a connection, so it never opens one.
 * Projections hand the built SQL to Emmett; queries run it on the shared pool.
 */
export const sql = knex({client: 'pg'});
