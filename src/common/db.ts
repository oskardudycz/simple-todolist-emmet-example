import knex, {type Knex} from 'knex';
import type pg from 'pg';
import {RawSQL, type SQL} from '@event-driven-io/dumbo';

export {getPgPool, endPgPool} from '@event-driven-io/dumbo/pg';

export const postgresUrl = process.env.SUPABASE_DB_URL ?? 'missing-url';

/**
 * Knex on a pool shares it - it opens no connection of its own. Without one it only
 * builds SQL, which is all projections need.
 */
export const knexInstance = (pool?: pg.Pool): Knex =>
    knex({client: 'pg', ...(pool ? {connectionPool: pool} : {})});

const sqlBuilder = knexInstance();

/**
 * Pass the client from the projection context to read on the connection and inside the
 * transaction Emmett is already using. Without it the builder only generates SQL.
 */
export const knexTable = <T extends {}>(
    tableName: string,
    client?: pg.ClientBase,
): Knex.QueryBuilder<T> =>
    client ? sqlBuilder<T>(tableName).connection(client) : sqlBuilder<T>(tableName);

/** Projections only generate SQL - Emmett runs it on the event store connection. */
export const sql = (builder: Knex.QueryBuilder): SQL => RawSQL`${builder.toQuery()}`;
