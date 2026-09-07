import {before, describe, it} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment} from '../../../testing/e2eEnvironment';

describe('Add task E2E', () => {
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

    it('adds a task to a defined list', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `addtask-e2e-${Date.now()}`;

        await given((request) =>
            request
                .post(`/api/definelist/${id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({name: 'Groceries'}),
        )
            .when((request) =>
                request
                    .post(`/api/addtask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Milk'}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('adds a task without a list defined', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `addtask-e2e-nolist-${Date.now()}`;

        await given()
            .when((request) =>
                request
                    .post(`/api/addtask/${id}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({name: 'Milk'}),
            )
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    it('rejects a request without a token', async (t) => {
        if (!environment.available) return t.skip(environment.reason);
        const id = `addtask-e2e-anon-${Date.now()}`;

        await given()
            .when((request) => request.post(`/api/addtask/${id}`).send({name: 'Milk'}))
            .then([expectResponse(401)]);
    });
});
