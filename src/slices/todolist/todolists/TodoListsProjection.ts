import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import type {SQL} from '@event-driven-io/dumbo';
import {knexTable, sql} from '../../../common/db';
import type {TodoListDefined} from '../TodoListEvents';

export const tableName = 'todo_lists';

export type TodoListsReadModel = {
    id: string;
    name: string;
};

type TodoListsEvents = TodoListDefined;

const todoLists = () => knexTable<TodoListsReadModel>(tableName).withSchema('public');

export const TodoListsProjection = postgreSQLRawSQLProjection<TodoListsEvents>({
    name: 'TodoListsProjection',
    canHandle: ['TodoListDefined'],
    evolve: (event): SQL[] => {
        switch (event.type) {
            case 'TodoListDefined':
                return [
                    sql(
                        todoLists()
                            .insert({
                                id: event.data.id,
                                name: event.data.name,
                            })
                            .onConflict('id')
                            .merge(['name']),
                    ),
                ];

            default:
                return [];
        }
    },
});
