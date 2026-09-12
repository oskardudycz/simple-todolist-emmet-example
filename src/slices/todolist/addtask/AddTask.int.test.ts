import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, expectError, getApplication} from '@event-driven-io/emmett-expressjs';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {created, addTask, appended} from '../../../testing/todoListApi';
import {
    correlatedWith,
    taskAdded,
    todoList,
    todoListDefined,
} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
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
                    apis: [api({eventStore: es, authenticate: allowAnyUser})],
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

        await given(todoList(id, todoListDefined(id, 'Groceries')))
            .when(addTask(id, {name: 'Buy milk'}))
            .then([
                created(2, {correlationId: id, causationId: id}),
                appended(id, [taskAdded(id, 'Buy milk', correlatedWith(id))]),
            ]);
    });

    it('adds a task to a list that was never defined', async () => {
        const id = 'addtask-int-2';

        await given()
            .when(addTask(id, {name: 'Buy milk'}))
            .then([
                created(1, {correlationId: id, causationId: id}),
                appended(id, [taskAdded(id, 'Buy milk', correlatedWith(id))]),
            ]);
    });

    it('fails with a bad request when name is missing', async () => {
        const id = 'addtask-int-3';

        await given()
            .when(addTask(id, {}))
            .then([expectError(400)]);
    });
});
