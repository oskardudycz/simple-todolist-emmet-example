import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import {RawSQL, SQL} from '@event-driven-io/dumbo';
import {sql} from '../../../common/sql';
import type {TaskAdded, TaskResolved} from '../TodoListEvents';

export const tableName = 'tasks';

export type TasksReadModel = {
    id: string;
    name: string;
};

type TasksEvents = TaskAdded | TaskResolved;

export const TasksProjection = postgreSQLRawSQLProjection<TasksEvents>({
    name: 'TasksProjection',
    canHandle: ['TaskAdded', 'TaskResolved'],
    evolve: async (event): Promise<SQL[]> => {
        switch (event.type) {
            case 'TaskAdded':
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

            case 'TaskResolved':
                return [
                    RawSQL`${sql(tableName)
                        .withSchema('public')
                        .where({id: event.data.id})
                        .delete()
                        .toQuery()}`,
                ];

            default:
                return [];
        }
    },
});
