import {getPostgreSQLEventStore, PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {pgEventStoreDriver} from '@event-driven-io/emmett-postgresql/pg';
import {projections} from '@event-driven-io/emmett';
import pg from 'pg';
import {postgresUrl, getSharedPool} from './db';
import {projectionRegistry} from '../slices/projections';

let eventStoreInstance: PostgresEventStore | null = null;

export const createEventStore = async (
    connectionString: string,
    pool?: pg.Pool,
): Promise<PostgresEventStore> => {
    const eventStore = getPostgreSQLEventStore({
        driver: pgEventStoreDriver,
        connectionString,
        schema: {
            autoMigration: 'CreateOrUpdate',
        },
        connectionOptions: pool ? {pooled: true, pool} : undefined,
        projections: projections.inline(Object.values(projectionRegistry)),
    });

    await eventStore.schema.migrate();

    return eventStore;
};

export const findEventstore = async (): Promise<PostgresEventStore> => {
    if (!eventStoreInstance) {
        eventStoreInstance = await createEventStore(postgresUrl, getSharedPool());
    }
    return eventStoreInstance;
};
