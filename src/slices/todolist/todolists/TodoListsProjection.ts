import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {RawSQL, SQL} from '@event-driven-io/dumbo';
import {sql} from '../../../common/sql';
import type {TodoListDefined} from '../TodoListEvents';

export const tableName = 'todo_lists';

export type TodoListsReadModel = {
    id: string;
    name: string;
};

type TodoListsEvents = TodoListDefined;

export const TodoListsProjection = postgreSQLRawSQLProjection<TodoListsEvents>({
    name: 'TodoListsProjection',
    canHandle: ['TodoListDefined'],
    evolve: async (event): Promise<SQL[]> => {
        switch (event.type) {
            case 'TodoListDefined':
                return [
                    RawSQL`${sql(tableName)
                        .withSchema('public')
                        .insert({
                            id: event.data.id,
                            name: event.data.name,
                        })
                        .onConflict('id')
                        .merge(['name'])
                        .toQuery()}`,
                ];

            default:
                return [];
        }
    },
});
