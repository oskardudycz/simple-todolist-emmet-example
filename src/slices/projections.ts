import type {PostgreSQLProjectionDefinition} from '@event-driven-io/emmett-postgresql';
import {TasksProjection} from './todolist/tasks/TasksProjection';
import {TodoListsProjection} from './todolist/todolists/TodoListsProjection';

/**
 * Projection definitions are invariant in their event type, so a registry holding more
 * than one of them has to widen. The lookup is by name and checked at runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegisteredProjection = PostgreSQLProjectionDefinition<any>;

export const projectionRegistry: Record<string, RegisteredProjection> = {
    TasksProjection,
    TodoListsProjection,
};
