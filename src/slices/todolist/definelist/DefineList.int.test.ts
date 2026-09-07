import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {
    ApiSpecification,
    existingStream,
    expectError,
    expectNewEvents,
    expectResponse,
    getApplication,
} from '@event-driven-io/emmett-expressjs';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {TodoListEvents, toTodoListStreamId} from '../TodoListEvents';
import {api} from './routes';

describe('Define list Api Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let given: ApiSpecification<TodoListEvents>;

    before(async () => {
        database = await startPostgresTestDatabase();
        eventStore = await createEventStore(database.connectionString);

        given = ApiSpecification.for<TodoListEvents, PostgresEventStore>({
            getEventStore: () => eventStore,
            getApplication: (es) =>
                getApplication({
                    apis: [api(es, {authenticate: allowAnyUser})],
                    enableDefaultExpressEtag: true,
                }),
        });
    });

    after(async () => {
        await eventStore?.close();
        await database?.stop();
    });

    it('defines a list on an empty stream', async () => {
        const id = 'definelist-int-1';

        await given()
            .when((request) => request.post(`/api/definelist/${id}`).send({name: 'Groceries'}))
            .then([
                expectResponse(201, {
                    body: {ok: true, next_expected_stream_version: '1'},
                    headers: {correlation_id: id, causation_id: id},
                }),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TodoListDefined',
                        data: {id, name: 'Groceries'},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });

    it('echoes an explicit correlation_id header', async () => {
        const id = 'definelist-int-2';
        const correlationId = 'correlation-42';

        await given()
            .when((request) =>
                request
                    .post(`/api/definelist/${id}`)
                    .set('correlation_id', correlationId)
                    .send({name: 'Groceries'}),
            )
            .then([
                expectResponse(201, {headers: {correlation_id: correlationId, causation_id: id}}),
            ]);
    });

    it('defines a list again on an existing stream', async () => {
        const id = 'definelist-int-3';

        await given(
            existingStream(toTodoListStreamId(id), [
                {
                    type: 'TodoListDefined',
                    data: {id, name: 'Groceries'},
                    metadata: {},
                },
            ]),
        )
            .when((request) => request.post(`/api/definelist/${id}`).send({name: 'Chores'}))
            .then([expectResponse(201, {body: {ok: true, next_expected_stream_version: '2'}})]);
    });

    it('fails with a bad request when name is missing', async () => {
        const id = 'definelist-int-4';

        await given()
            .when((request) => request.post(`/api/definelist/${id}`).send({}))
            .then([
                expectError(400, {
                    status: 400,
                    title: 'Bad Request',
                    detail: 'NOT_A_NONEMPTY_STRING',
                }),
            ]);
    });
});
