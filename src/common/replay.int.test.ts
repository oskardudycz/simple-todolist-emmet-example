import assert from 'assert';
import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import knex, {Knex} from 'knex';
import {PostgresTestDatabase, startPostgresTestDatabase} from '../testing/postgresTestDatabase';
import {createEventStore} from '../common/loadPostgresEventstore';
import {toTodoListStreamId} from '../slices/todolist/TodoListEvents';
import {tableName} from '../slices/todolist/tasks/TasksProjection';
import {replayProjection} from './replay';

describe('Projection replay', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let db: Knex;

    before(async () => {
        database = await startPostgresTestDatabase();
        eventStore = await createEventStore(database.connectionString);
        db = knex({client: 'pg', connection: database.connectionString});
    });

    after(async () => {
        await db?.destroy();
        await eventStore?.close();
        await database?.stop();
    });

    it('rebuilds the tasks read model from the event store', async () => {
        const id = 'replay-int-1';

        await eventStore.appendToStream(toTodoListStreamId(id), [
            {type: 'TaskAdded', data: {id, name: 'Buy milk'}, metadata: {}},
        ]);

        await db(tableName).withSchema('public').where({id}).delete();
        const emptied = await db(tableName).withSchema('public').where({id}).first();
        assert.strictEqual(emptied, undefined, 'read model should be empty before the replay');

        await replayProjection('TasksProjection', database.connectionString);

        const row = await db(tableName).withSchema('public').where({id}).first();
        assert.ok(row, 'replay should have rebuilt the row');
        assert.strictEqual(row.name, 'Buy milk');
    });

    it('fails for an unknown projection', async () => {
        await assert.rejects(() =>
            replayProjection('ThereIsNoSuchProjection', database.connectionString),
        );
    });
});
