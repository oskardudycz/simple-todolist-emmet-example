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

describe('Todo Lists Query Api Specification', () => {
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

    const listDefined = (id: string, ...names: string[]) =>
        existingStream(
            toTodoListStreamId(id),
            names.map((name) => ({
                type: 'TodoListDefined' as const,
                data: {id, name},
                metadata: {},
            })),
        );

    it('lists a defined list in the collection', async () => {
        const id = 'todolists-query-1';

        await given(listDefined(id, 'Chores'))
            .when((request) => request.get('/api/query/todolists-collection'))
            .then([expectResponse(200, {body: [{id, name: 'Chores'}]})]);
    });

    it('returns a single list for a known _id', async () => {
        const id = 'todolists-query-2';

        await given(listDefined(id, 'Groceries'))
            .when((request) => request.get('/api/query/todolists-collection').query({_id: id}))
            .then([expectResponse(200, {body: {id, name: 'Groceries'}})]);
    });

    it('returns null with status 200 for an unknown _id', async () => {
        await given()
            .when((request) =>
                request
                    .get('/api/query/todolists-collection')
                    .query({_id: 'todolists-query-unknown'}),
            )
            .then([expectNullBody()]);
    });

    it('reflects a renamed list', async () => {
        const id = 'todolists-query-3';

        await given(listDefined(id, 'Groceries', 'Shopping'))
            .when((request) => request.get('/api/query/todolists-collection').query({_id: id}))
            .then([expectResponse(200, {body: {id, name: 'Shopping'}})]);
    });

    it('returns 401 when the caller is not authenticated', async () => {
        await givenUnauthenticated()
            .when((request) => request.get('/api/query/todolists-collection'))
            .then([expectResponse(401, {body: {error: 'Missing authorization token'}})]);
    });
});
