import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type TodoListEvents} from '../TodoListEvents';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type DefineListCommand = Command<
    'DefineList',
    {
        id: string;
        name: string;
    },
    {
        correlation_id?: string;
        causation_id?: string;
    }
>;

export type DefineListState = {};

export const DefineListInitialState = (): DefineListState => ({});

export const evolve = (state: DefineListState, event: TodoListEvents): DefineListState => {
    const {type} = event;

    switch (type) {
        default:
            return state;
    }
};

export const decide = (command: DefineListCommand, state: DefineListState): TodoListEvents[] => {
    return [
        {
            type: 'TodoListDefined',
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

const DefineListCommandHandler = CommandHandler<DefineListState, TodoListEvents>({
    evolve,
    initialState: DefineListInitialState,
});

export const handleDefineList = async (id: string, command: DefineListCommand) => {
    const eventStore = await findEventstore();
    const result = await DefineListCommandHandler(eventStore, id, (state: DefineListState) =>
        decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
