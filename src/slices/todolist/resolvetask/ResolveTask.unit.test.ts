import {DeciderSpecification} from '@event-driven-io/emmett';
import {ResolveTaskCommand, ResolveTaskInitialState, decide, evolve} from './ResolveTaskCommand';
import {describe, it} from 'node:test';

describe('Resolve Task Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: ResolveTaskInitialState,
    });

    it('spec: Resolve Task - creates TaskResolved event on empty stream', () => {
        const command: ResolveTaskCommand = {
            type: 'ResolveTask',
            data: {
                id: 'task-1',
            },
            metadata: {},
        };

        given([])
            .when(command)
            .then([
                {
                    type: 'TaskResolved',
                    data: {
                        id: 'task-1',
                    },
                    metadata: {},
                },
            ]);
    });
});
