import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {RawSQL, SQL} from '@event-driven-io/dumbo';
import knex, {Knex} from 'knex';
import type {TodoListDefined} from '../TodoListEvents';

export const tableName = 'todo_lists';

export type TodoListsReadModel = {
    id: string;
    name: string;
};

export const getKnexInstance = (connectionString: string): Knex =>
    knex({client: 'pg', connection: connectionString, pool: {min: 0, max: 1}});

type TodoListsEvents = TodoListDefined;

export const TodoListsProjection = postgreSQLRawSQLProjection<TodoListsEvents>({
    name: 'TodoListsProjection',
    canHandle: ['TodoListDefined'],
    evolve: async (event, context): Promise<SQL[]> => {
        const db = getKnexInstance(context.connection.connectionString);

        try {
            switch (event.type) {
                case 'TodoListDefined':
                    return [RawSQL`${db(tableName)
                        .withSchema('public')
                        .insert({
                            id: event.data.id,
                            name: event.data.name,
                        })
                        .onConflict('id')
                        .merge(['name'])
                        .toQuery()}`];

                default:
                    return [];
            }
        } finally {
            await db.destroy();
        }
    },
});
