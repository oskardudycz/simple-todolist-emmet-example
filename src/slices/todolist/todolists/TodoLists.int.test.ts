import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, expectResponse, getApplication} from '@event-driven-io/emmett-expressjs';
import type {Knex} from 'knex';
import {endPgPool, getPgPool} from '@event-driven-io/dumbo/pg';
import {knexInstance} from '../../../common/db';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser, rejectAll} from '../../../testing/stubAuth';
import {getTodoList, getTodoLists, unauthorized} from '../../../testing/todoListApi';
import {todoList, todoListDefined} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
import {api} from './routes';

describe('Todo Lists Query Api Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let db: Knex;
    let given: ApiSpecification<TodoListEvents>;
    let givenUnauthenticated: ApiSpecification<TodoListEvents>;

    before(async () => {
        database = await startPostgresTestDatabase();
        const pool = getPgPool(database.connectionString);
        db = knexInstance(pool);
        eventStore = await createEventStore(database.connectionString, pool);

        const specificationFor = (authenticate: typeof allowAnyUser) =>
            ApiSpecification.for<TodoListEvents, PostgresEventStore>({
                getEventStore: () => eventStore,
                getApplication: (es) =>
                    getApplication({
                        apis: [api({db, authenticate})],
                        enableDefaultExpressEtag: true,
                    }),
            });

        given = specificationFor(allowAnyUser);
        givenUnauthenticated = specificationFor(rejectAll);
    });

    after(async () => {
        await db?.destroy();
        await eventStore?.close();
        await endPgPool({connectionString: database.connectionString});
        await database?.stop();
    });

    it('lists a defined list in the collection', async () => {
        const id = 'todolists-query-1';

        await given(todoList(id, todoListDefined(id, 'Chores')))
            .when(getTodoLists())
            .then([expectResponse(200, {body: [{id, name: 'Chores'}]})]);
    });

    it('returns a single list for a known _id', async () => {
        const id = 'todolists-query-2';

        await given(todoList(id, todoListDefined(id, 'Groceries')))
            .when(getTodoList(id))
            .then([expectResponse(200, {body: {id, name: 'Groceries'}})]);
    });

    it('returns null with status 200 for an unknown _id', async () => {
        await given()
            .when(getTodoList('todolists-query-unknown'))
            .then([expectResponse(200)]);
    });

    it('reflects a renamed list', async () => {
        const id = 'todolists-query-3';

        await given(todoList(id, todoListDefined(id, 'Groceries'), todoListDefined(id, 'Shopping')))
            .when(getTodoList(id))
            .then([expectResponse(200, {body: {id, name: 'Shopping'}})]);
    });

    it('returns 401 when the caller is not authenticated', async () => {
        await givenUnauthenticated().when(getTodoLists()).then([unauthorized()]);
    });
});
