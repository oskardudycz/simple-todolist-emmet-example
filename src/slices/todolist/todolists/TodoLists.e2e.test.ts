import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, getTodoLists} from '../../../testing/todoListApi';

describe('Todo lists query E2E', () => {
    let environment: E2EEnvironment;
    let given: ApiE2ESpecification;
    let api: ReturnType<typeof authenticatedAs>;

    const scenario = scenarioRunner(() => environment);

    before(async () => {
        environment = await getE2EEnvironment();

        if (environment.available) {
            const app = environment.app;
            api = authenticatedAs(environment.token);
            given = ApiE2ESpecification.for({getApplication: () => app});
        }
    });

    scenario('returns a defined list by id', async () => {
        const id = `todolists-e2e-${Date.now()}`;

        await given(api.defineList(id, {name: 'Groceries'}))
            .when(api.getTodoList(id))
            .then([expectResponse(200, {body: {id, name: 'Groceries'}})]);
    });

    scenario('lists a defined list in the collection', async () => {
        const id = `todolists-e2e-list-${Date.now()}`;

        await given(api.defineList(id, {name: 'Groceries'}))
            .when(api.getTodoLists())
            .then([
                (response) => {
                    if (response.statusCode !== 200) return false;
                    return response.body.some((list: {id: string}) => list.id === id);
                },
            ]);
    });

    scenario('returns null for an unknown id', async () => {
        await given()
            .when(api.getTodoList(`todolists-e2e-unknown-${Date.now()}`))
            .then([expectResponse(200)]);
    });

    scenario('rejects a request without a token', async () => {
        await given()
            .when(getTodoLists())
            .then([expectResponse(401)]);
    });
});
