import {getPostgreSQLEventStore, PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {pgEventStoreDriver} from '@event-driven-io/emmett-postgresql/pg';
import {projections} from '@event-driven-io/emmett';
import type pg from 'pg';
import {getPgPool, postgresUrl} from './db';
import {TodoListsProjection} from '../slices/todolist/todolists/TodoListsProjection';
import {TasksProjection} from '../slices/todolist/tasks/TasksProjection';

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
        projections: projections.inline([TodoListsProjection, TasksProjection]),
    });

    await eventStore.schema.migrate();

    return eventStore;
};

export const findEventstore = async (): Promise<PostgresEventStore> => {
    if (!eventStoreInstance) {
        eventStoreInstance = await createEventStore(postgresUrl, getPgPool(postgresUrl));
    }
    return eventStoreInstance;
};
