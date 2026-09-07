import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {type TodoListEvents} from '../TodoListEvents';

export type DeleteTaskCommand = Command<
    'DeleteTask',
    {
        id: string;
    },
    {
        correlation_id?: string;
        causation_id?: string;
    }
>;

export type DeleteTaskState = {};

export const DeleteTaskInitialState = (): DeleteTaskState => ({});

export const evolve = (state: DeleteTaskState, event: TodoListEvents): DeleteTaskState => {
    const {type} = event;

    switch (type) {
        default:
            return state;
    }
};

export const decide = (command: DeleteTaskCommand, state: DeleteTaskState): TodoListEvents[] => {
    return [
        {
            type: 'TaskDeleted',
            data: {
                id: command.data.id,
            },
            metadata: {
                correlation_id: command.metadata?.correlation_id,
                causation_id: command.metadata?.causation_id,
            },
        },
    ];
};

const DeleteTaskCommandHandler = CommandHandler<DeleteTaskState, TodoListEvents>({
    evolve,
    initialState: DeleteTaskInitialState,
});

export const handleDeleteTask = async (
    eventStore: PostgresEventStore,
    id: string,
    command: DeleteTaskCommand,
) => {
    const result = await DeleteTaskCommandHandler(eventStore, id, (state: DeleteTaskState) =>
        decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
