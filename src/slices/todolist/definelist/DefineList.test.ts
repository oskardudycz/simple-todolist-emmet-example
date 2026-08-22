import {DeciderSpecification} from '@event-driven-io/emmett';
import {
    DefineListCommand,
    DefineListInitialState,
    decide,
    evolve,
} from './DefineListCommand';
import {describe, it} from 'node:test';

describe('Define list Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: DefineListInitialState,
    });

    it('spec: Define list - creates TodoListDefined event on empty stream', () => {
        const command: DefineListCommand = {
            type: 'DefineList',
            data: {
                id: 'list-1',
                name: 'Work',
            },
            metadata: {},
        };

        given([])
            .when(command)
            .then([{
                type: 'TodoListDefined',
                data: {
                    id: 'list-1',
                    name: 'Work',
                },
                metadata: {},
            }]);
    });
});
