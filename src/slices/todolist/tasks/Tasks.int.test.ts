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
import {getTask, getTasks, unauthorized} from '../../../testing/todoListApi';
import {taskAdded, taskResolved, todoList} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
import {api} from './routes';

describe('Tasks Query Api Specification', () => {
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

    it('lists an added task in the collection', async () => {
        const id = 'tasks-query-1';

        await given(todoList(id, taskAdded(id, 'Walk the dog')))
            .when(getTasks())
            .then([expectResponse(200, {body: [{id, name: 'Walk the dog'}]})]);
    });

    it('returns a single task for a known _id', async () => {
        const id = 'tasks-query-2';

        await given(todoList(id, taskAdded(id, 'Buy groceries')))
            .when(getTask(id))
            .then([expectResponse(200, {body: {id, name: 'Buy groceries'}})]);
    });

    it('returns null with status 200 for an unknown _id', async () => {
        await given()
            .when(getTask('tasks-query-unknown'))
            .then([expectResponse(200)]);
    });

    it('drops a task from the collection once it is resolved', async () => {
        const id = 'tasks-query-3';

        await given(todoList(id, taskAdded(id, 'Buy groceries'), taskResolved(id)))
            .when(getTask(id))
            .then([expectResponse(200)]);
    });

    it('returns 401 when the caller is not authenticated', async () => {
        await givenUnauthenticated().when(getTasks()).then([unauthorized()]);
    });
});
