import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, getApplication} from '@event-driven-io/emmett-expressjs';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {created, appended, deleteTask} from '../../../testing/todoListApi';
import {correlatedWith, taskAdded, taskDeleted, todoList} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
import {api} from './routes';

describe('Delete task Api Specification', () => {
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
                    apis: [api({eventStore: es, authenticate: allowAnyUser})],
                    enableDefaultExpressEtag: true,
                }),
        });
    });

    after(async () => {
        await eventStore?.close();
        await database?.stop();
    });

    it('deletes an added task', async () => {
        const id = 'deletetask-int-1';

        await given(todoList(id, taskAdded(id, 'Buy milk')))
            .when(deleteTask(id))
            .then([
                created(2, {correlationId: id, causationId: id}),
                appended(id, [taskDeleted(id, correlatedWith(id))]),
            ]);
    });

    it('deletes the same task twice', async () => {
        const id = 'deletetask-int-2';

        await given(todoList(id, taskAdded(id, 'Buy milk')))
            .when(deleteTask(id))
            .then([created(2), appended(id, [taskDeleted(id, correlatedWith(id))])]);

        await given()
            .when(deleteTask(id))
            .then([created(3), appended(id, [taskDeleted(id, correlatedWith(id))])]);
    });
});
