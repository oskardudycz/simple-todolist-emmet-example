---
name: build-state-view
description: Implements an emmett state-view slice (projection, tests, route, migration) from a slice.json definition
---

# Build State View Slice

> Before doing anything else, read the slice definition from `.slices/{Context}/{slicename}/slice.json`. This file is the **source of truth** for all fields, events, and read model shape. Never invent fields not defined there.

---

## What a State View Slice is

A state-view slice is a **read model projection**. It listens to events from the event store and materializes them into a queryable PostgreSQL table. It does not emit events or process commands.

---

## Step 1 — Read the slice.json

From the slice definition, extract:
- **sliceName** — the projection name
- **context** — bounded context
- **events[]** — events this projection handles (its `canHandle` list)
- **readModel / fields** — the columns of the output table
- **storylines[]** (optional) — narrated walkthroughs that may yield additional projection tests; see Step 5b
> **Comments & description**: Each element (commands, events, readmodels, processors, screens, tables) carries a `comments: string[]` array (board comments on that node) and a `description` field. The slice itself also has `comments: string[]`. Use these as implementation hints — pass them as code comments, documentation, or validation logic where they add value. When done, resolve each used comment: `POST <BASE_URL>/api/org/<ORG_ID>/boards/<BOARD_ID>/nodes/<nodeId>/comments/<commentId>/resolve` (get comment IDs first via GET on the same path without the last two segments).


---

## Step 2 — Create the migration

File: `supabase/migrations/V{N}__{tablename}.sql`

Choose the next available version number by checking existing migration files.

```sql
CREATE TABLE IF NOT EXISTS "public"."{tablename}"
(
    id          TEXT PRIMARY KEY,
    -- other columns from read model fields in slice.json
    -- use snake_case for all column names
    created_at  TIMESTAMP DEFAULT NOW()
);
```

**Column type guide** — field `type` values are the canonical set from the [event-modeling-spec schema](https://github.com/dilgerma/event-modeling-spec/blob/main/eventmodeling.schema.json):

| Field type | SQL type |
|-----------|---------|
| `String` | `TEXT` |
| `UUID` | `TEXT` |
| `Int` | `INTEGER` |
| `Long` | `BIGINT` |
| `Double` | `DOUBLE PRECISION` |
| `Decimal` | `NUMERIC` |
| `Boolean` | `BOOLEAN` |
| `Date` | `DATE` |
| `DateTime` | `TIMESTAMP` |
| `Custom` | `JSONB` |

Nullable columns (`optional: true` on the field): allow `NULL` instead of adding a default.

The PRIMARY KEY column is the one used in `.onConflict(...)` in the projection.

---

## Step 3 — Create `{SliceName}Projection.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}Projection.ts`

### Full structure

```typescript
import {postgreSQLRawSQLProjection} from '@event-driven-io/emmett-postgresql';
import type {SQL} from '@event-driven-io/dumbo';
import {knexTable, sql} from '../../../common/db';
import type {{EventA}, {EventB}} from '../{Context}Events';

export const tableName = '{tablename}';

// TypeScript shape of one row in the read model
export type {SliceName}ReadModel = {
    id: string;
    // ... fields from slice.json readModel
};

type {SliceName}Events = {EventA} | {EventB};

const {slicename} = () => knexTable<{SliceName}ReadModel>(tableName).withSchema('public');

export const {SliceName}Projection = postgreSQLRawSQLProjection<{SliceName}Events>({
    name: '{SliceName}Projection',
    canHandle: ['{EventA}', '{EventB}'],
    evolve: (event): SQL[] => {
        switch (event.type) {
            case '{EventA}':
                // Insert with upsert — use for create/update events
                return [sql({slicename}()
                    .insert({
                        id:     event.data.id,
                        field1: event.data.field1,
                        field2: event.data.field2,
                    })
                    .onConflict('id')
                    .merge(['field1', 'field2']))];

            case '{EventB}':
                // Delete — use for cancellation/removal events
                return [sql({slicename}()
                    .where({id: event.data.id})
                    .delete())];

            default:
                return [];
        }
    },
});
```

### SQL operation patterns

**Insert with upsert (create or update):**
```typescript
return [sql({slicename}()
    .insert({id: event.data.id, field: event.data.field})
    .onConflict('id')
    .merge(['field']))];   // list only columns to update on conflict
```

**Update only (record already exists):**
```typescript
return [sql({slicename}()
    .where({id: event.data.id})
    .update({field: event.data.field}))];
```

**Delete:**
```typescript
return [sql({slicename}()
    .where({id: event.data.id})
    .delete())];
```

**Async DB lookup before update** (when you need to read current state first) — pass the client from the projection context as `knexTable`'s second argument, and that builder executes on the connection and transaction Emmett is already using:
```typescript
evolve: async (event, context): Promise<SQL[]> => {
    const client = await context.session.connection.open();

    const row = await knexTable<{SliceName}ReadModel>(tableName, client)
        .withSchema('public')
        .where({id: event.data.id})
        .select('field')
        .first();

    if (!row) return [];

    return [sql({slicename}()
        .where({id: event.data.id})
        .update({field: row.field + delta}))];
},
```

Such a read cannot see the writes of its own batch: the generated SQL runs only after every event in the batch has been evolved. When a handler needs what an earlier event in the same batch wrote, use `postgreSQLProjection` with a `handle` that executes as it goes.

`sql()` renders the knex builder with dumbo's `RawSQL`, which inlines text verbatim — correct only because knex's `.toQuery()` already escaped the values. When interpolating values directly rather than a finished knex query, use the `SQL` template tag instead — it binds interpolated values as query parameters.

`knexTable` and `sql` come from `src/common/db.ts`. A projection never builds a knex instance of its own and never executes, so there is nothing to destroy and `evolve` needs no `try/finally`.

---

## Step 4 — Register the projection in the event store

File: `src/common/loadPostgresEventstore.ts`

Add the new projection to the `projections.inline([...])` array:

```typescript
import {{SliceName}Projection} from '../slices/{context}/{SliceName}/{SliceName}Projection';

// inside getPostgreSQLEventStore options:
projections: projections.inline([
    // ... existing projections ...
    {SliceName}Projection,
]),
```

---

## Step 5 — Create `{SliceName}.int.test.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}.int.test.ts`

> The `.int.` suffix is what makes the file run: `npm run test:int` globs `src/**/*.int.test.ts`.
> A plain `.test.ts` runs in no suite.

Uses `PostgreSQLProjectionSpec` with a real PostgreSQL container (Testcontainers). `startPostgresTestDatabase()` from `src/testing/postgresTestDatabase.ts` starts the container and runs the actual Flyway migrations, so the schema matches production exactly.

```typescript
import {before, after, describe, it} from 'node:test';
import {PostgreSQLProjectionAssert, PostgreSQLProjectionSpec} from '@event-driven-io/emmett-postgresql';
import {{SliceName}Projection} from './{SliceName}Projection';
import {PostgresTestDatabase, startPostgresTestDatabase} from '../../../testing/postgresTestDatabase';
import knex, {Knex} from 'knex';
import assert from 'assert';

const TEST_ID = 'test-id-001';

describe('{SliceName} Specification', () => {
    let database: PostgresTestDatabase;
    let connectionString: string;
    let db: Knex;
    let given: PostgreSQLProjectionSpec<any>;

    before(async () => {
        database = await startPostgresTestDatabase();   // container + Flyway migrations
        connectionString = database.connectionString;

        db = knex({client: 'pg', connection: connectionString});

        // Insert any prerequisite rows required by foreign keys:
        // await db('parent_table').withSchema('public').insert({...});

        given = PostgreSQLProjectionSpec.for({
            projection: {SliceName}Projection,
            connectionString,
        });
    });

    after(async () => {
        await db?.destroy();
        await database?.stop();
    });

    it('spec: {SliceName} - inserts row on {EventA}', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb('{tablename}')
                    .withSchema('public')
                    .where({id: TEST_ID})
                    .first();

                assert.ok(result, 'row should exist');
                assert.strictEqual(result.id, TEST_ID);
                assert.strictEqual(result.field1, 'expected-value');
            } finally {
                await queryDb.destroy();
            }
        };

        await given([{
            type: '{EventA}',
            data: {id: TEST_ID, field1: 'expected-value'},
            metadata: {stream_name: `{context}-${TEST_ID}`},
        }])
            .when([])
            .then(assertReadModel);
    });

    it('spec: {SliceName} - removes row on {EventB}', async () => {
        const assertReadModel: PostgreSQLProjectionAssert = async ({connectionString: connStr}) => {
            const queryDb = knex({client: 'pg', connection: connStr});
            try {
                const result = await queryDb('{tablename}')
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
                type: '{EventA}',
                data: {id: TEST_ID, field1: 'value'},
                metadata: {stream_name: `{context}-${TEST_ID}`},
            },
            {
                type: '{EventB}',
                data: {id: TEST_ID},
                metadata: {stream_name: `{context}-${TEST_ID}`},
            },
        ])
            .when([])
            .then(assertReadModel);
    });
});
```

Write one `it` block per specification in the slice.json. Use `given([events]).when([]).then(assertReadModel)`.

---

## Step 5b — Storyline-derived tests (optional)

Some slices also have a `storylines[]` array in slice.json — narrated walkthroughs where the *same* read model repeats across several beats in one ordered `elements[]` list, showing its state at different points in a single flow. Most slices have no storylines; skip this step silently when `storylines[]` is empty or absent.

A storyline embedded in this slice's slice.json already belongs entirely to this slice — no need to match beats against `readmodels[]` by id/title. For each storyline, scan `elements[]` for pairs of adjacent `type: 'READMODEL'` beats with only EVENT beat(s) in between. Each such pair is a clean, self-contained projection test — the same shape as the specifications-derived tests above:
- `given` — the cumulative ordered EVENT beats from the start of the storyline through the intervening event(s), not just the two beats either side (earlier events in the same storyline still apply to accumulated state)
- `then` — assert the read model matches the later beat's shape, using its `fields`/`examples`/`expectEmptyList` exactly like a specifications-derived assertion

Put these in their own `describe` block per storyline, named after the storyline's `title` (e.g. `describe('Storyline: {storyline.title}', ...)`) — never merge them into the `specifications[]` suite; storylines are a supplementary narrative check, not a replacement for scenario coverage.

Skip (do not fabricate) a segment when:
- a COMMAND beat sits between two read-model beats — that half belongs to **build-state-change** (the command → event transition); only the event → read-model half after it is testable here
- a beat (e.g. SCREEN) can't be traced to an event affecting the read model

---

## Step 6 — Create `routes.ts`

File: `src/slices/{context}/{SliceName}/routes.ts`

> **Concrete example**: `src/slices/todolist/tasks/routes.ts`. Read it before implementing.

A query slice takes its dependencies as an argument, so tests can hand it a container-backed database and a stub auth.

```typescript
import {Request, Response, Router} from 'express';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {QuerySliceDependencies} from '../../../common/dependencies';
import {{SliceName}ReadModel, tableName} from './{SliceName}Projection';

export const api = ({db, authenticate}: QuerySliceDependencies): WebApiSetup => (router: Router): void => {

    router.get('/api/query/{slicename}-collection', async (req: Request, res: Response) => {
        const principal = await requireUser(req, res, authenticate);
        if (principal.error) return;

        const id = req.query._id?.toString();

        const {slicename} = db<{SliceName}ReadModel>(tableName).withSchema('public');
        const data = id ? await {slicename}.where({id}).first() : await {slicename}.select();

        return res.status(200).json(data ?? (id ? null : []));
    });
};
```

`db` is a **connected** knex, built in `server.ts` on the same pool as the event store, so awaiting a builder executes it — unlike the poolless `knexTable` in the projection. The app sets a `json replacer`, so `bigint` values serialize without a hand-written `JSON.parse(JSON.stringify(...))`.

### Testing the route

The Step 5 projection spec asserts the table. Add an API test to the same `{SliceName}.int.test.ts` that asserts the endpoint: append events, call the route, check the response. `ApiSpecification` appends the `given` events through the event store, so the projection runs and the route reads what it wrote.

> **Concrete example**: `src/slices/todolist/tasks/Tasks.int.test.ts`.

```typescript
import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, expectResponse, getApplication} from '@event-driven-io/emmett-expressjs';
import type {Knex} from 'knex';
import {endPgPool, getPgPool} from '@event-driven-io/dumbo/pg';
import {knexInstance} from '../../../common/db';
import {PostgresTestDatabase, startPostgresTestDatabase} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser, rejectAll} from '../../../testing/stubAuth';
import {get{SliceName}, unauthorized} from '../../../testing/{context}Api';
import {{eventBuilder}, {streamBuilder}} from '../../../testing/{context}Events';
import {{Context}Events} from '../{Context}Events';
import {api} from './routes';

describe('{SliceName} Query Api Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let db: Knex;
    let given: ApiSpecification<{Context}Events>;
    let givenUnauthenticated: ApiSpecification<{Context}Events>;

    before(async () => {
        database = await startPostgresTestDatabase();

        const pool = getPgPool(database.connectionString);   // one pool, shared
        db = knexInstance(pool);
        eventStore = await createEventStore(database.connectionString, pool);

        const specificationFor = (authenticate: typeof allowAnyUser) =>
            ApiSpecification.for<{Context}Events, PostgresEventStore>({
                getEventStore: () => eventStore,
                getApplication: () => getApplication({
                    apis: [api({db, authenticate})],
                    enableDefaultExpressEtag: true,
                }),
            });

        given = specificationFor(allowAnyUser);
        givenUnauthenticated = specificationFor(rejectAll);
    });

    after(async () => {
        await db?.destroy();          // leaves the pool alone — knex does not own it
        await eventStore?.close();
        await endPgPool({connectionString: database.connectionString});
        await database?.stop();
    });

    it('returns a row for a known _id', async () => {
        const id = '{slicename}-query-1';

        await given({streamBuilder}(id, {eventBuilder}(id, 'expected-value')))
            .when(get{SliceName}(id))
            .then([expectResponse(200, {body: {id, field1: 'expected-value'}})]);
    });

    it('returns 401 when the caller is not authenticated', async () => {
        await givenUnauthenticated()
            .when(get{SliceName}('{slicename}-query-1'))
            .then([unauthorized()]);
    });
});
```

---

## Step 7 — Create `{SliceName}.e2e.test.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}.e2e.test.ts`

The same scenarios driven through the whole application — `createApp()`, the real auth gate, a real Supabase JWT.

`getE2EEnvironment()` from `src/testing/e2eEnvironment.ts` signs the e2e user in and builds the app. `scenarioRunner(() => environment)` returns a `scenario(...)` that replaces `it`: it reads the environment at run time and skips the body, with a reason, when Supabase is unconfigured or unreachable — so the suite stays green without credentials. `authenticatedAs(token)` wraps the request builders so every `api.*` call carries the JWT.

> **Concrete example**: `src/slices/todolist/tasks/Tasks.e2e.test.ts` — copy its shape.

```typescript
import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, get{SliceName}} from '../../../testing/{context}Api';

describe('{SliceName} query E2E', () => {
    let environment: E2EEnvironment;
    let given: ApiE2ESpecification;
    let api: ReturnType<typeof authenticatedAs>;

    // reads `environment` at run time — it is only resolved in `before`
    const scenario = scenarioRunner(() => environment);

    before(async () => {
        environment = await getE2EEnvironment();

        if (environment.available) {
            const app = environment.app;
            api = authenticatedAs(environment.token);
            given = ApiE2ESpecification.for({getApplication: () => app});
        }
    });

    scenario('returns a row by id', async () => {
        const id = `{slicename}-e2e-${Date.now()}`;

        // the read model is written by the projection, so the row is set up by the command
        await given(api.{commandBuilder}(id, {field: 'value'}))
            .when(api.get{SliceName}(id))
            .then([expectResponse(200, {body: {id, field1: 'value'}})]);
    });

    scenario('rejects a request without a token', async () => {
        // the bare builder, not api.*, so no Authorization header is sent
        await given()
            .when(get{SliceName}(`{slicename}-e2e-anon-${Date.now()}`))
            .then([expectResponse(401)]);
    });
});
```

E2E runs against a shared database, so give every scenario a unique id (`${Date.now()}`) instead of the fixed `TEST_ID` the container tests use.

---

## Step 8 — Wire up the route

Nothing to do. `server.ts` globs `dist/src/slices/**/routes{,-*}.js` and calls each module's exported `api` with `{eventStore, db, authenticate}`. A slice is wired as soon as the file exists and exports an `api` that accepts that object.

---

## Files to create / modify

```
src/slices/{context}/{SliceName}/
├── {SliceName}Projection.ts     ← projection logic (generates SQL, never executes)
├── {SliceName}.int.test.ts      ← projection spec + route tests, real container
├── {SliceName}.e2e.test.ts      ← same scenarios through the whole app and real Supabase
└── routes.ts                    ← GET query endpoint

src/testing/
└── {context}Api.ts              ← add this slice's request builders

supabase/migrations/
└── V{N}__{tablename}.sql        ← table DDL

src/common/
└── loadPostgresEventstore.ts    ← add projection to inline([...]) list
```

---

## Checklist

- [ ] Migration file created with correct version number and all columns
- [ ] `tableName` constant matches the migration table name exactly
- [ ] Projection registered in `loadPostgresEventstore.ts`
- [ ] `canHandle` lists every event type the projection reacts to
- [ ] Projection uses `knexTable`/`sql` from `src/common/db.ts` — no knex instance of its own,
      no `db.destroy()`, no connection string read from the context
- [ ] `routes.ts` takes `QuerySliceDependencies` and runs queries on the injected `db`
- [ ] Tests use `startPostgresTestDatabase()` from `src/testing/` — it applies the real
      Flyway migrations — and share one pool between knex and the event store
- [ ] Teardown order: `db.destroy()` → `eventStore.close()` → `endPgPool()` → `database.stop()`
- [ ] One test scenario per specification in slice.json
- [ ] `.int.test.ts` and `.e2e.test.ts` both present — the suffix decides which suite runs them
- [ ] E2E scenarios use `scenarioRunner` so they skip with a reason when Supabase is unavailable,
      and unique ids, since e2e runs against a shared database
- [ ] If `storylines[]` is present, each read-model-to-read-model transition relevant to this slice has a corresponding storyline test (or a documented reason it was skipped)
- [ ] Storyline-derived tests live in their own `describe` block, separate from the specifications suite
- [ ] Every field in the read model definition in slice.json has a column in the migration and a field in the TypeScript type — no invented columns
- [ ] Every event type in `events[]` is listed in the projection's `canHandle` — no assumed events
- [ ] No extra columns or fields were added beyond what slice.json defines
- [ ] No field names were assumed or guessed — if a field is not in slice.json, it is not in the code