import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {
    ApiSpecification,
    existingStream,
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

describe('Resolve task Api Specification', () => {
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

    it('resolves an added task', async () => {
        const id = 'resolvetask-int-1';

        await given(
            existingStream(toTodoListStreamId(id), [
                {
                    type: 'TaskAdded',
                    data: {id, name: 'Buy milk'},
                    metadata: {},
                },
            ]),
        )
            .when((request) => request.post(`/api/resolvetask/${id}`).send({}))
            .then([
                expectResponse(201, {
                    body: {ok: true, next_expected_stream_version: '2'},
                    headers: {correlation_id: id, causation_id: id},
                }),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskResolved',
                        data: {id},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });

    it('resolves a task that does not exist', async () => {
        const id = 'resolvetask-int-2';

        await given()
            .when((request) => request.post(`/api/resolvetask/${id}`).send({}))
            .then([
                expectResponse(201, {body: {ok: true, next_expected_stream_version: '1'}}),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskResolved',
                        data: {id},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });

    it('resolves the same task twice', async () => {
        const id = 'resolvetask-int-3';

        await given(
            existingStream(toTodoListStreamId(id), [
                {
                    type: 'TaskAdded',
                    data: {id, name: 'Buy milk'},
                    metadata: {},
                },
            ]),
        )
            .when((request) => request.post(`/api/resolvetask/${id}`).send({}))
            .then([
                expectResponse(201, {body: {ok: true, next_expected_stream_version: '2'}}),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskResolved',
                        data: {id},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);

        await given()
            .when((request) => request.post(`/api/resolvetask/${id}`).send({}))
            .then([
                expectResponse(201, {body: {ok: true, next_expected_stream_version: '3'}}),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskResolved',
                        data: {id},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });
});
