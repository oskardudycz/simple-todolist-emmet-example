import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectError, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../../testing/e2eEnvironment';

describe('Define list E2E', () => {
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

    it('defines a list', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `definelist-e2e-${Date.now()}`;

        await given()
            .when((request) =>
                request
                    .post(`/api/definelist/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Groceries'}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('defines a list that already exists', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `definelist-e2e-again-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/definelist/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Groceries'}),
        )
            .when((request) =>
                request
                    .post(`/api/definelist/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Chores'}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('rejects a request without a token', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `definelist-e2e-anon-${Date.now()}`;

        await given()
            .when((request) => request.post(`/api/definelist/${id}`).send({name: 'Groceries'}))
            .then([expectResponse(401)]);
    });

    it('fails with a bad request when name is missing', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `definelist-e2e-noname-${Date.now()}`;

        await given()
            .when((request) =>
                request
                    .post(`/api/definelist/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({}),
            )
            .then([
                expectError(400, {
                    status: 400,
                    title: 'Bad Request',
                    detail: 'NOT_A_NONEMPTY_STRING',
                }),
            ]);
    });
});
