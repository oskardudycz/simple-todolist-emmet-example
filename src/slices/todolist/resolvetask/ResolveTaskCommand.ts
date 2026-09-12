import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type TodoListEvents} from '../TodoListEvents';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type ResolveTaskCommand = Command<
    'ResolveTask',
    {
        id: string;
    },
    {
        correlation_id?: string;
        causation_id?: string;
    }
>;

export type ResolveTaskState = {};

export const ResolveTaskInitialState = (): ResolveTaskState => ({});

export const evolve = (state: ResolveTaskState, event: TodoListEvents): ResolveTaskState => {
    const {type} = event;

    switch (type) {
        default:
            return state;
    }
};

export const decide = (command: ResolveTaskCommand, state: ResolveTaskState): TodoListEvents[] => {
    return [
        {
            type: 'TaskResolved',
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

const ResolveTaskCommandHandler = CommandHandler<ResolveTaskState, TodoListEvents>({
    evolve,
    initialState: ResolveTaskInitialState,
});

export const handleResolveTask = async (id: string, command: ResolveTaskCommand) => {
    const eventStore = await findEventstore();
    const result = await ResolveTaskCommandHandler(eventStore, id, (state: ResolveTaskState) =>
        decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
