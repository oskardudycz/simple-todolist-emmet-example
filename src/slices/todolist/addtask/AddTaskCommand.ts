import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {type TodoListEvents} from '../TodoListEvents';

export type AddTaskCommand = Command<
    'AddTask',
    {
        id: string;
        name: string;
    },
    {
        correlation_id?: string;
        causation_id?: string;
    }
>;

export type AddTaskState = {};

export const AddTaskInitialState = (): AddTaskState => ({});

export const evolve = (state: AddTaskState, event: TodoListEvents): AddTaskState => {
    const {type} = event;

    switch (type) {
        default:
            return state;
    }
};

export const decide = (command: AddTaskCommand, state: AddTaskState): TodoListEvents[] => {
    return [
        {
            type: 'TaskAdded',
            data: {
                id: command.data.id,
                name: command.data.name,
            },
            metadata: {
                correlation_id: command.metadata?.correlation_id,
                causation_id: command.metadata?.causation_id,
            },
        },
    ];
};

const AddTaskCommandHandler = CommandHandler<AddTaskState, TodoListEvents>({
    evolve,
    initialState: AddTaskInitialState,
});

export const handleAddTask = async (
    eventStore: PostgresEventStore,
    id: string,
    command: AddTaskCommand,
) => {
    const result = await AddTaskCommandHandler(eventStore, id, (state: AddTaskState) =>
        decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
