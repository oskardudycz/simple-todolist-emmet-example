import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, addTask} from '../../../testing/todoListApi';

describe('Add task E2E', () => {
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

    scenario('adds a task to a defined list', async () => {
        const id = `addtask-e2e-${Date.now()}`;

        await given(api.defineList(id, {name: 'Groceries'}))
            .when(api.addTask(id, {name: 'Milk'}))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('adds a task without a list defined', async () => {
        const id = `addtask-e2e-nolist-${Date.now()}`;

        await given()
            .when(api.addTask(id, {name: 'Milk'}))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('rejects a request without a token', async () => {
        const id = `addtask-e2e-anon-${Date.now()}`;

        await given()
            .when(addTask(id, {name: 'Milk'}))
            .then([expectResponse(401)]);
    });
});
