import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import type {SQL} from '@event-driven-io/dumbo';
import {knexTable, sql} from '../../../common/db';
import type {TaskAdded, TaskResolved} from '../TodoListEvents';

export const tableName = 'tasks';

export type TasksReadModel = {
    id: string;
    name: string;
};

type TasksEvents = TaskAdded | TaskResolved;

const tasks = () => knexTable<TasksReadModel>(tableName).withSchema('public');

export const TasksProjection = postgreSQLRawSQLProjection<TasksEvents>({
    name: 'TasksProjection',
    canHandle: ['TaskAdded', 'TaskResolved'],
    evolve: (event): SQL[] => {
        switch (event.type) {
            case 'TaskAdded':
                return [
                    sql(
                        tasks()
                            .insert({
                                id: event.data.id,
                                name: event.data.name,
                            })
                            .onConflict('id')
                            .merge(['name']),
                    ),
                ];

            case 'TaskResolved':
                return [sql(tasks().where({id: event.data.id}).delete())];

            default:
                return [];
        }
    },
});
