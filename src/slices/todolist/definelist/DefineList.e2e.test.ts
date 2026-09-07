import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectError, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, defineList} from '../../../testing/todoListApi';

describe('Define list E2E', () => {
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

    scenario('defines a list', async () => {
        const id = `definelist-e2e-${Date.now()}`;

        await given()
            .when(api.defineList(id, {name: 'Groceries'}))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('defines a list that already exists', async () => {
        const id = `definelist-e2e-again-${Date.now()}`;

        await given(api.defineList(id, {name: 'Groceries'}))
            .when(api.defineList(id, {name: 'Chores'}))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('rejects a request without a token', async () => {
        const id = `definelist-e2e-anon-${Date.now()}`;

        await given()
            .when(defineList(id, {name: 'Groceries'}))
            .then([expectResponse(401)]);
    });

    scenario('fails with a bad request when name is missing', async () => {
        const id = `definelist-e2e-noname-${Date.now()}`;

        await given()
            .when(api.defineList(id, {}))
            .then([expectError(400)]);
    });
});
