import assert from 'assert';
import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../../testing/e2eEnvironment';

describe('Todo lists query E2E', () => {
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

    it('returns a defined list in the collection', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `todolists-e2e-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/definelist/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Groceries'}),
        )
            .when((request) =>
                request
                    .get('/api/query/todolists-collection')
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([
                (response) => {
                    assert.strictEqual(response.statusCode, 200);
                    assert.ok(Array.isArray(response.body));
                    assert.ok(response.body.some((list: {id: string}) => list.id === id));
                },
            ]);
    });

    it('returns a single list by id', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `todolists-e2e-byid-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/definelist/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Groceries'}),
        )
            .when((request) =>
                request
                    .get(`/api/query/todolists-collection?_id=${id}`)
                    .set('Authorization', `Bearer ${token}`),
            )
            .then([expectResponse(200, {body: {id, name: 'Groceries'}})]);
    });

    it('returns null for an unknown id', async (t) => {
        if (!environment.available) return t.skip(environment.reason);

        await given()
            .when((request) =>
                request
                    .get(`/api/query/todolists-collection?_id=todolists-e2e-unknown-${Date.now()}`)
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
            .when((request) => request.get('/api/query/todolists-collection'))
            .then([expectResponse(401)]);
    });
});
