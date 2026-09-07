import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {
    ApiSpecification,
    existingStream,
    expectResponse,
    getApplication,
} from '@event-driven-io/emmett-expressjs';
import pg from 'pg';
import {expectNullBody} from '../../../testing/apiAssertions';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser, rejectAll} from '../../../testing/stubAuth';
import {TodoListEvents, toTodoListStreamId} from '../TodoListEvents';
import {api} from './routes';

describe('Tasks Query Api Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let pool: pg.Pool;
    let given: ApiSpecification<TodoListEvents>;
    let givenUnauthenticated: ApiSpecification<TodoListEvents>;

    before(async () => {
        database = await startPostgresTestDatabase();
        eventStore = await createEventStore(database.connectionString);
        pool = new pg.Pool({connectionString: database.connectionString});

        given = ApiSpecification.for<TodoListEvents, PostgresEventStore>({
            getEventStore: () => eventStore,
            getApplication: (es) =>
                getApplication({
                    apis: [api(es, {pool, authenticate: allowAnyUser})],
                    enableDefaultExpressEtag: true,
                }),
        });

        givenUnauthenticated = ApiSpecification.for<TodoListEvents, PostgresEventStore>({
            getEventStore: () => eventStore,
            getApplication: (es) =>
                getApplication({
                    apis: [api(es, {pool, authenticate: rejectAll})],
                    enableDefaultExpressEtag: true,
                }),
        });
    });

    after(async () => {
        await pool?.end();
        await eventStore?.close();
        await database?.stop();
    });

    const taskAdded = (id: string, name: string) =>
        existingStream(toTodoListStreamId(id), [
            {
                type: 'TaskAdded' as const,
                data: {id, name},
                metadata: {},
            },
        ]);

    it('lists an added task in the collection', async () => {
        const id = 'tasks-query-1';

        await given(taskAdded(id, 'Walk the dog'))
            .when((request) => request.get('/api/query/tasks-collection'))
            .then([expectResponse(200, {body: [{id, name: 'Walk the dog'}]})]);
    });

    it('returns a single task for a known _id', async () => {
        const id = 'tasks-query-2';

        await given(taskAdded(id, 'Buy groceries'))
            .when((request) => request.get('/api/query/tasks-collection').query({_id: id}))
            .then([expectResponse(200, {body: {id, name: 'Buy groceries'}})]);
    });

    it('returns null with status 200 for an unknown _id', async () => {
        await given()
            .when((request) =>
                request.get('/api/query/tasks-collection').query({_id: 'tasks-query-unknown'}),
            )
            .then([expectNullBody()]);
    });

    it('drops a task from the collection once it is resolved', async () => {
        const id = 'tasks-query-3';

        await given(
            existingStream(toTodoListStreamId(id), [
                {type: 'TaskAdded', data: {id, name: 'Buy groceries'}, metadata: {}},
                {type: 'TaskResolved', data: {id}, metadata: {}},
            ]),
        )
            .when((request) => request.get('/api/query/tasks-collection').query({_id: id}))
            .then([expectNullBody()]);
    });

    it('returns 401 when the caller is not authenticated', async () => {
        await givenUnauthenticated()
            .when((request) => request.get('/api/query/tasks-collection'))
            .then([expectResponse(401, {body: {error: 'Missing authorization token'}})]);
    });
});
