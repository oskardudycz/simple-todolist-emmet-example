import {before, after, describe, it} from 'node:test';
import type {TaskAdded, TaskResolved} from '../TodoListEvents';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {TasksProjection, tableName} from './TasksProjection';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import knex, {Knex} from 'knex';
import assert from 'assert';
import {runFlywayMigrations} from '../../../common/testHelpers';

const TEST_ID = 'test-id-001';

describe('Tasks Specification', () => {
    let postgres: StartedPostgreSqlContainer;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<TaskAdded | TaskResolved>;

    before(async () => {
        postgres = await new PostgreSqlContainer('postgres').start();
        connectionString = postgres.getConnectionUri();

        db = knex({client: 'pg', connection: connectionString});

        await runFlywayMigrations(connectionString);

        given = PostgreSQLProjectionSpec.for({
            projection: TasksProjection,
            connectionString,
        });
    });

    after(async () => {
        await db?.destroy();
        await postgres?.stop();
    });

    it('spec: Tasks - inserts row on TaskAdded', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb(tableName)
                    .withSchema('public')
                    .where({id: TEST_ID})
                    .first();

                assert.ok(result, 'row should exist');
                assert.strictEqual(result.id, TEST_ID);
                assert.strictEqual(result.name, 'Buy groceries');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([{
            type: 'TaskAdded',
            data: {id: TEST_ID, name: 'Buy groceries'},
            metadata: {stream_name: `todolist-${TEST_ID}`},
        }])
            .when([])
            .then(assertReadModel);
    });

    it('spec: Tasks - removes row on TaskResolved', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb(tableName)
                    .withSchema('public')
                    .where({id: TEST_ID})
                    .first();

                assert.strictEqual(result, undefined, 'row should be deleted');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([
            {
                type: 'TaskAdded',
                data: {id: TEST_ID, name: 'Buy groceries'},
                metadata: {stream_name: `todolist-${TEST_ID}`},
            },
            {
                type: 'TaskResolved',
                data: {id: TEST_ID},
                metadata: {stream_name: `todolist-${TEST_ID}`},
            },
        ])
            .when([])
            .then(assertReadModel);
    });
});
