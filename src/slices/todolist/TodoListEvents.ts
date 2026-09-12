import type {Event} from '@event-driven-io/emmett';

type CommonMeta = {
    stream_name?: string;
    userId?: string;
    correlation_id?: string;
    causation_id?: string;
};

export type TodoListDefined = Event<
    'TodoListDefined',
    {
        id: string;
        name: string;
    },
    CommonMeta
>;

export type TaskAdded = Event<
    'TaskAdded',
    {
        id: string;
        name: string;
    },
    CommonMeta
>;

export type TaskResolved = Event<
    'TaskResolved',
    {
        id: string;
    },
    CommonMeta
>;

export type TaskDeleted = Event<
    'TaskDeleted',
    {
        id: string;
    },
    CommonMeta
>;

export type TodoListEvents = TodoListDefined | TaskAdded | TaskResolved | TaskDeleted;
