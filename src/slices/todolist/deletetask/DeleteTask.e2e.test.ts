import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../../testing/e2eEnvironment';

describe('Delete task E2E', () => {
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

    it('deletes an added task', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `deletetask-e2e-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/addtask/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Milk'}),
        )
            .when((request) =>
                request
                    .post(`/api/deletetask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('deletes the same task twice', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `deletetask-e2e-twice-${Date.now()}`;

        await given(
            (request) =>
                request
                    .post(`/api/addtask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Milk'}),
            (request) =>
                request
                    .post(`/api/deletetask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({}),
        )
            .when((request) =>
                request
                    .post(`/api/deletetask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('rejects a request without a token', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `deletetask-e2e-anon-${Date.now()}`;

        await given()
            .when((request) => request.post(`/api/deletetask/${id}`).send({}))
            .then([expectResponse(401)]);
    });
});
