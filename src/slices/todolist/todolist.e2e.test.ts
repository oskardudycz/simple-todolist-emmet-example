import assert from 'assert';
import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../testing/e2eEnvironment';

describe('Todo list flow E2E', () => {
    let environment: E2EEnvironment;
    let given: ApiE2ESpecification;
    let token: string;

    before(async () => {
        environment = await getE2EEnvironment();

        if (environment.available) {
            const app = environment.app;
            token = environment.token;
            given = ApiE2ESpecification.for({getApplication: () => app});
        }
    });

    it('defines a list, adds a task, resolves it', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `todolist-e2e-flow-${Date.now()}`;

        await given(
            (request) =>
                request
                    .post(`/api/definelist/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Groceries'}),
            (request) =>
                request
                    .post(`/api/addtask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Milk'}),
        )
            .when((request) =>
                request
                    .get(`/api/query/tasks-collection?_id=${id}`)
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([expectResponse(200, {body: {id, name: 'Milk'}})]);

        await given((request) =>
            request.post(`/api/resolvetask/${id}`).set('Authorization', `Bearer ${token}`).send({}),
        )
            .when((request) =>
                request
                    .get(`/api/query/tasks-collection?_id=${id}`)
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.strictEqual(response.body, null);
                },
            ]);
    });

    it('serves the api docs without a token', async (t) => {
        if (!environment.available) return t.skip(environment.reason);

        await given()
            .when((request) => request.get('/api-docs/'))
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                },
            ]);
    });

    it('returns not found for an unknown route', async (t) => {
        if (!environment.available) return t.skip(environment.reason);

        await given()
            .when((request) =>
                request
                    .get('/api/query/there-is-no-such-route')
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 404);
                },
            ]);
    });
});
