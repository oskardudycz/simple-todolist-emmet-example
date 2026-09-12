import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import type {Knex} from 'knex';
import type {Authenticate} from '../supabase/requireUser';

export type CommandSliceDependencies = {
    eventStore: PostgresEventStore;
    authenticate?: Authenticate;
};

/** Read models live in the database, so query slices run knex on the event store's pool. */
export type QuerySliceDependencies = {
    db: Knex;
    authenticate?: Authenticate;
};
