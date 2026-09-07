import type {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {SliceDeps} from '../common/deps';
import {api as defineListApi} from './todolist/definelist/routes';
import {api as addTaskApi} from './todolist/addtask/routes';
import {api as resolveTaskApi} from './todolist/resolvetask/routes';
import {api as deleteTaskApi} from './todolist/deletetask/routes';
import {api as tasksApi} from './todolist/tasks/routes';
import {api as todoListsApi} from './todolist/todolists/routes';

export type SliceApi = (eventStore: PostgresEventStore, deps: SliceDeps) => WebApiSetup;

export type SliceProcessor = {
    start: (eventStore: PostgresEventStore) => Promise<void>;
    stop: () => Promise<void>;
};

export const slices: SliceApi[] = [
    defineListApi,
    addTaskApi,
    resolveTaskApi,
    deleteTaskApi,
    tasksApi,
    todoListsApi,
];

export const processors: SliceProcessor[] = [];
