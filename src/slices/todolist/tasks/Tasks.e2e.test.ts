import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, getTasks} from '../../../testing/todoListApi';

describe('Tasks query E2E', () => {
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

    scenario('returns an added task by id', async () => {
        const id = `tasks-e2e-${Date.now()}`;

        await given(api.addTask(id, {name: 'Milk'}))
            .when(api.getTask(id))
            .then([expectResponse(200, {body: {id, name: 'Milk'}})]);
    });

    scenario('drops a resolved task', async () => {
        const id = `tasks-e2e-resolved-${Date.now()}`;

        await given(api.addTask(id, {name: 'Milk'}), api.resolveTask(id))
            .when(api.getTask(id))
            .then([expectResponse(200)]);
    });

    scenario('lists tasks in the collection', async () => {
        const id = `tasks-e2e-list-${Date.now()}`;

        await given(api.addTask(id, {name: 'Milk'}))
            .when(api.getTasks())
            .then([
                (response) => {
                    if (response.statusCode !== 200) return false;
                    return response.body.some((task: {id: string}) => task.id === id);
                },
            ]);
    });

    scenario('returns null for an unknown id', async () => {
        await given()
            .when(api.getTask(`tasks-e2e-unknown-${Date.now()}`))
            .then([expectResponse(200)]);
    });

    scenario('rejects a request without a token', async () => {
        await given()
            .when(getTasks())
            .then([expectResponse(401)]);
    });
});
