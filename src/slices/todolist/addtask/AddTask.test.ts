import {DeciderSpecification} from '@event-driven-io/emmett';
import {
    AddTaskCommand,
    AddTaskInitialState,
    decide,
    evolve,
} from './AddTaskCommand';
import {describe, it} from 'node:test';

describe('Add task Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: AddTaskInitialState,
    });

    it('spec: Add task - creates TaskAdded event on empty stream', () => {
        const command: AddTaskCommand = {
            type: 'AddTask',
            data: {
                id: 'task-1',
                name: 'Buy groceries',
            },
            metadata: {},
        };

        given([])
            .when(command)
            .then([{
                type: 'TaskAdded',
                data: {
                    id: 'task-1',
                    name: 'Buy groceries',
                },
                metadata: {},
            }]);
    });
});
