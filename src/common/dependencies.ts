import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import type pg from 'pg';
import type {Authenticate} from '../supabase/requireUser';

export type CommandSliceDependencies = {
    eventStore: PostgresEventStore;
    authenticate?: Authenticate;
};

/** Read models live in the database, so query slices run on the shared pool instead. */
export type QuerySliceDependencies = {
    pool: pg.Pool;
    authenticate?: Authenticate;
};
