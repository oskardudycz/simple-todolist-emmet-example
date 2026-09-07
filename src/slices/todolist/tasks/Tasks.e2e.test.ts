import assert from 'assert';
import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../../testing/e2eEnvironment';

describe('Tasks query E2E', () => {
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

    it('returns an added task in the collection', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `tasks-e2e-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/addtask/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Milk'}),
        )
            .when((request) =>
                request.get('/api/query/tasks-collection').set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.ok(Array.isArray(response.body));
                    assert.ok(response.body.some((task: {id: string}) => task.id === id));
                },
            ]);
    });

    it('drops a resolved task from the collection', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `tasks-e2e-resolved-${Date.now()}`;

        await given(
            (request) =>
                request
                    .post(`/api/addtask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Milk'}),
            (request) =>
                request
                    .post(`/api/resolvetask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({}),
        )
            .when((request) =>
                request.get('/api/query/tasks-collection').set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.ok(!response.body.some((task: {id: string}) => task.id === id));
                },
            ]);
    });

    it('returns a single task by id', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `tasks-e2e-byid-${Date.now()}`;

        await given((request) =>
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
    });

    it('returns null for an unknown id', async (t) => {
        if (!environment.available) return t.skip(environment.reason);

        await given()
            .when((request) =>
                request
                    .get(`/api/query/tasks-collection?_id=tasks-e2e-unknown-${Date.now()}`)
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.strictEqual(response.body, null);
                },
            ]);
    });

    it('rejects a request without a token', async (t) => {
        if (!environment.available) return t.skip(environment.reason);

        await given()
            .when((request) => request.get('/api/query/tasks-collection'))
            .then([expectResponse(401)]);
    });
});
