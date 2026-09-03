import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {RawSQL, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import type {TaskAdded, TaskResolved} from '../TodoListEvents';

export const tableName = 'tasks';

export type TasksReadModel = {
    id: string;
    name: string;
};

export const getKnexInstance = (connectionString: string): Knex =>
    knex({client: 'pg', connection: connectionString, pool: {min: 0, max: 1}});

type TasksEvents = TaskAdded | TaskResolved;

export const TasksProjection = postgreSQLRawSQLProjection<TasksEvents>({
    name: 'TasksProjection',
    canHandle: ['TaskAdded', 'TaskResolved'],
    evolve: async (event, context): Promise<SQL[]> => {
        const db = getKnexInstance(context.connection.connectionString);

        try {
            switch (event.type) {
                case 'TaskAdded':
                    return [RawSQL`${db(tableName)
                        .withSchema('public')
                        .insert({
                            id: event.data.id,
                            name: event.data.name,
                        })
                        .onConflict('id')
                        .merge(['name'])
                        .toQuery()}`];

                case 'TaskResolved':
                    return [RawSQL`${db(tableName)
                        .withSchema('public')
                        .where({id: event.data.id})
                        .delete()
                        .toQuery()}`];

                default:
                    return [];
            }
        } finally {
            await db.destroy();
        }
    },
});
