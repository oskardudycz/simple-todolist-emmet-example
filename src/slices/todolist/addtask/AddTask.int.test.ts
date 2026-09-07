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

describe('Add task Api Specification', () => {
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

    it('adds a task to a defined list', async () => {
        const id = 'addtask-int-1';

        await given(
            existingStream(toTodoListStreamId(id), [
                {
                    type: 'TodoListDefined',
                    data: {id, name: 'Groceries'},
                    metadata: {},
                },
            ]),
        )
            .when((request) => request.post(`/api/addtask/${id}`).send({name: 'Buy milk'}))
            .then([
                expectResponse(201, {
                    body: {ok: true, next_expected_stream_version: '2'},
                    headers: {correlation_id: id, causation_id: id},
                }),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskAdded',
                        data: {id, name: 'Buy milk'},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });

    it('adds a task to a list that was never defined', async () => {
        const id = 'addtask-int-2';

        await given()
            .when((request) => request.post(`/api/addtask/${id}`).send({name: 'Buy milk'}))
            .then([
                expectResponse(201, {body: {ok: true, next_expected_stream_version: '1'}}),
                expectNewEvents(toTodoListStreamId(id), [
                    {
                        type: 'TaskAdded',
                        data: {id, name: 'Buy milk'},
                        metadata: {correlation_id: id, causation_id: id},
                    },
                ]),
            ]);
    });

    it('fails with a bad request when name is missing', async () => {
        const id = 'addtask-int-3';

        await given()
            .when((request) => request.post(`/api/addtask/${id}`).send({}))
            .then([
                expectError(400, {
                    status: 400,
                    title: 'Bad Request',
                    detail: 'NOT_A_NONEMPTY_STRING',
                }),
            ]);
    });
});
