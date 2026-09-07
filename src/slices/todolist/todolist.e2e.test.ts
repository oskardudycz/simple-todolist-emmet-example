import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../testing/e2eEnvironment';
import {authenticatedAs, get} from '../../testing/todoListApi';

describe('Todo list flow E2E', () => {
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

    scenario('defines a list, adds a task, then resolves it', async () => {
        const id = `todolist-e2e-flow-${Date.now()}`;

        await given(api.defineList(id, {name: 'Groceries'}), api.addTask(id, {name: 'Milk'}))
            .when(api.getTask(id))
            .then([expectResponse(200, {body: {id, name: 'Milk'}})]);

        await given(api.resolveTask(id))
            .when(api.getTask(id))
            .then([expectResponse(200)]);
    });

    scenario('serves the api docs without a token', async () => {
        await given()
            .when(get('/api-docs/'))
            .then([expectResponse(200)]);
    });

    scenario('returns not found for an unknown route', async () => {
        await given()
            .when(api.get('/api/query/there-is-no-such-route'))
            .then([expectResponse(404)]);
    });
});
