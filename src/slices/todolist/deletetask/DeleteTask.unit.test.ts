import {DeciderSpecification} from '@event-driven-io/emmett';
import {DeleteTaskCommand, DeleteTaskInitialState, decide, evolve} from './DeleteTaskCommand';
import {describe, it} from 'node:test';

describe('Delete Task Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: DeleteTaskInitialState,
    });

    it('spec: Delete Task - creates TaskDeleted event on empty stream', () => {
        const command: DeleteTaskCommand = {
            type: 'DeleteTask',
            data: {
                id: 'task-1',
            },
            metadata: {},
        };

        given([])
            .when(command)
            .then([
                {
                    type: 'TaskDeleted',
                    data: {
                        id: 'task-1',
                    },
                    metadata: {},
                },
            ]);
    });
});
