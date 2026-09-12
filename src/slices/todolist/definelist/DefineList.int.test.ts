import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {
    ApiSpecification,
    expectError,
    expectResponse,
    getApplication,
} from '@event-driven-io/emmett-expressjs';
import {
    PostgresTestDatabase,
    startPostgresTestDatabase,
} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {created, appended, defineList} from '../../../testing/todoListApi';
import {correlatedWith, todoList, todoListDefined} from '../../../testing/todoListEvents';
import {TodoListEvents} from '../TodoListEvents';
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
                    apis: [api({eventStore: es, authenticate: allowAnyUser})],
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
            .when(defineList(id, {name: 'Groceries'}))
            .then([
                created(1, {correlationId: id, causationId: id}),
                appended(id, [todoListDefined(id, 'Groceries', correlatedWith(id))]),
            ]);
    });

    it('echoes an explicit correlation_id header', async () => {
        const id = 'definelist-int-2';
        const correlationId = 'correlation-42';

        await given()
            .when(defineList(id, {name: 'Groceries'}, {correlationId}))
            .then([
                expectResponse(201, {headers: {correlation_id: correlationId, causation_id: id}}),
            ]);
    });

    it('defines a list again on an existing stream', async () => {
        const id = 'definelist-int-3';

        await given(todoList(id, todoListDefined(id, 'Groceries')))
            .when(defineList(id, {name: 'Chores'}))
            .then([
                created(2, {correlationId: id, causationId: id}),
                appended(id, [todoListDefined(id, 'Chores', correlatedWith(id))]),
            ]);
    });

    it('fails with a bad request when name is missing', async () => {
        const id = 'definelist-int-4';

        await given()
            .when(defineList(id, {}))
            .then([expectError(400)]);
    });
});
