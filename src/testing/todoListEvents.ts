import {existingStream} from '@event-driven-io/emmett-expressjs';
import {TodoListEvents, toTodoListStreamId} from '../slices/todolist/TodoListEvents';

type Metadata = TodoListEvents['metadata'];

/** Metadata the routes stamp on every event they append. */
export const correlatedWith = (id: string): Metadata => ({correlation_id: id, causation_id: id});

export const todoListDefined = (
    id: string,
    name: string,
    metadata: Metadata = {},
): TodoListEvents => ({type: 'TodoListDefined', data: {id, name}, metadata});

export const taskAdded = (id: string, name: string, metadata: Metadata = {}): TodoListEvents => ({
    type: 'TaskAdded',
    data: {id, name},
    metadata,
});

export const taskResolved = (id: string, metadata: Metadata = {}): TodoListEvents => ({
    type: 'TaskResolved',
    data: {id},
    metadata,
});

export const taskDeleted = (id: string, metadata: Metadata = {}): TodoListEvents => ({
    type: 'TaskDeleted',
    data: {id},
    metadata,
});

export const todoList = (id: string, ...events: TodoListEvents[]) =>
    existingStream(toTodoListStreamId(id), events);
