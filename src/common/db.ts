export {getPgPool, endPgPool} from '@event-driven-io/dumbo/pg';

export const postgresUrl = process.env.SUPABASE_DB_URL ?? 'missing-url';
