import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, resolveTask} from '../../../testing/todoListApi';

describe('Resolve task E2E', () => {
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

    scenario('resolves an added task', async () => {
        const id = `resolvetask-e2e-${Date.now()}`;

        await given(api.addTask(id, {name: 'Milk'}))
            .when(api.resolveTask(id))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('resolves a task that was never added', async () => {
        const id = `resolvetask-e2e-missing-${Date.now()}`;

        await given()
            .when(api.resolveTask(id))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('rejects a request without a token', async () => {
        const id = `resolvetask-e2e-anon-${Date.now()}`;

        await given()
            .when(resolveTask(id))
            .then([expectResponse(401)]);
    });
});
