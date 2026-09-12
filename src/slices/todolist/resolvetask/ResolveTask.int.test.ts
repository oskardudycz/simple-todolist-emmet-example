import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, getApplication} from '@event-driven-io/emmett-expressjs';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {created, appended, resolveTask} from '../../../testing/todoListApi';
import {correlatedWith, taskAdded, taskResolved, todoList} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
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
                    apis: [api({eventStore: es, authenticate: allowAnyUser})],
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

        await given(todoList(id, taskAdded(id, 'Buy milk')))
            .when(resolveTask(id))
            .then([
                created(2, {correlationId: id, causationId: id}),
                appended(id, [taskResolved(id, correlatedWith(id))]),
            ]);
    });

    it('resolves a task that does not exist', async () => {
        const id = 'resolvetask-int-2';

        await given()
            .when(resolveTask(id))
            .then([created(1), appended(id, [taskResolved(id, correlatedWith(id))])]);
    });

    it('resolves the same task twice', async () => {
        const id = 'resolvetask-int-3';

        await given(todoList(id, taskAdded(id, 'Buy milk')))
            .when(resolveTask(id))
            .then([created(2), appended(id, [taskResolved(id, correlatedWith(id))])]);

        await given()
            .when(resolveTask(id))
            .then([created(3), appended(id, [taskResolved(id, correlatedWith(id))])]);
    });
});
