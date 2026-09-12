import {before, after, describe, it} from 'node:test';
import type {TodoListDefined} from '../TodoListEvents';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {TodoListsProjection, tableName} from './TodoListsProjection';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import assert from 'assert';
import {runFlywayMigrations} from '../../../common/testHelpers';

const TEST_ID = 'test-id-001';

describe('Todo Lists Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<TodoListDefined>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();

        db = knex({client: 'pg', connection: connectionString});

        await runFlywayMigrations(connectionString);

        given = PostgreSQLProjectionSpec.for({
            projection: TodoListsProjection,
            connectionString,
        });
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: Todo Lists - inserts row on TodoListDefined', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb(tableName)
                    .withSchema('public')
                    .where({id: TEST_ID})
                    .first();

                assert.ok(result, 'row should exist');
                assert.strictEqual(result.id, TEST_ID);
                assert.strictEqual(result.name, 'Work');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([{
            type: 'TodoListDefined',
            data: {id: TEST_ID, name: 'Work'},
            metadata: {stream_name: `todolist-${TEST_ID}`},
        }])
            .when([])
            .then(assertReadModel);
    });

    it('spec: Todo Lists - updates name on repeated TodoListDefined', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb(tableName)
                    .withSchema('public')
                    .where({id: TEST_ID})
                    .first();

                assert.ok(result, 'row should exist');
                assert.strictEqual(result.name, 'Personal');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([
            {
                type: 'TodoListDefined',
                data: {id: TEST_ID, name: 'Work'},
                metadata: {stream_name: `todolist-${TEST_ID}`},
            },
            {
                type: 'TodoListDefined',
                data: {id: TEST_ID, name: 'Personal'},
                metadata: {stream_name: `todolist-${TEST_ID}`},
            },
        ])
            .when([])
            .then(assertReadModel);
    });
});
