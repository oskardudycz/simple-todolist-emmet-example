# Spec: less boilerplate and real test coverage for the todolist sample

**Repo:** `simple-todolist-emmet-example` (branch `0.43.0_enhancements`)
**Emmett:** `0.43.0-beta.42`, packages `emmett`, `emmett-expressjs`, `emmett-postgresql`
**Decisions captured in:** [qa.md](qa.md)

## Goal

Two outputs.

1. **The sample.** Show how this codebase looks with the boilerplate removed and with
   tests that actually prove the slices work. Delivered as two sequenced PRs: the minimum
   set of changes, then full Emmett mode.
2. **Upstream feedback.** What the `.build-kit` generator should stop emitting, and what
   Emmett could provide so the boilerplate is never written by hand. Delivered as the
   [Upstream](#upstream) section of this document — no issues are filed as part of this
   work.

## Findings — the current state

Evidence gathered while writing this spec. These are the things the work responds to.

### The four command slices are the same file four times

`definelist`, `addtask`, `resolvetask` and `deletetask` differ only in names. Each has:

- a `*Command.ts` with `type State = {}`, an `evolve` whose only branch is `default:
  return state`, and a `decide` that returns exactly one event, unconditionally;
- a `handle*` that calls `findEventstore()` itself, so the store is not a parameter;
- a `routes.ts` repeating ~40 identical lines: `requireUser`, read `:id`, read a
  `correlation_id` header defaulting to `:id`, build the command, `try`/`catch`, a
  hand-rolled 500, and a 201 whose body carries stringified bigints.

The two query slices (`tasks`, `todolists`) repeat a second block: `requireUser`, read
`_id`, `getKnexInstance()`, one-or-many, `try`/`catch`, hand-rolled 500.

### The per-route `catch` disables Problem Details

`getApplication` already installs `problemDetailsMiddleware` after the routes, and
Express 5 forwards rejected async handlers to it without `express-async-errors`. Every
route catches first and returns `{ok: false, error: 'Server error'}`, so RFC 9457 output
never happens and Emmett's error codes — `ValidationError` → 400, `IllegalStateError` →
403, `NotFoundError` → 404, `ConcurrencyError` → 412 — are all flattened to 500.

### Correlation and causation are reimplemented by hand, differently

Emmett carries `correlationId` and `causationId` on the observability scope
(`almanac/src/scopes/scope.ts:45`), inherits them into child scopes or generates them
when absent (`scope.ts:109-119`), seeds them on the command scope
(`emmett/src/commandHandling/handleCommand.ts:286`), and writes them into recorded
message metadata (`emmett/src/eventStore/inMemoryEventStore.ts:236`).

The sample instead puts snake_case `correlation_id` / `causation_id` into each command's
own metadata and echoes them as response headers — a parallel implementation with
different names, sitting next to the framework's own fields.

### Nothing bridges HTTP to that context

Searching `emmett`, `emmett-expressjs` and `almanac` for `traceparent`, `tracestate` and
`X-Correlation-Id` returns nothing. The only HTTP-side piece is `traceIdMiddleware`,
eight lines that *write* `x-trace-id` from the active OTel span. `propagation: 'links' |
'propagate'` in almanac is OTel span parenting, not W3C header propagation. W3C ingestion
would come from `@opentelemetry/instrumentation-http` plus a `W3CTraceContextPropagator`
in the SDK setup — and even then `correlationId` stays unset, because it is Emmett's
concept, not OTel's.

### The app cannot be constructed by a test

`server.ts` calls `startServer()` at module scope and exports nothing. Importing it boots
a listener, connects to Postgres, and globs `dist/**/routes.js` — so it needs a prior
`npm run build`. There is no `Application` to hand to SuperTest.

### Every route makes a network call before doing anything

`requireUser` calls `supabase.auth.getUser(token)` against `SUPABASE_URL`
(`src/supabase/requireUser.ts:53`). Without a running Supabase and a valid JWT, every
request in a test gets 401 before reaching a handler.

### `npm test` is not a unit test command

`tsx --test 'src/**/*.test.ts'` sweeps in `Tasks.test.ts` and `TodoLists.test.ts`, which
start a Postgres container and shell out to a globally installed `flyway` binary via
`execSync` (`src/common/testHelpers.ts`). The default test command needs Docker and
Flyway on `PATH`.

### Five helpers are imported by nothing

`src/common/parseEndpoint.ts` (both exports), `src/util/hash.ts`,
`src/common/processorDlq.ts`, `src/common/realtimeBroadcast.ts`, and `sanitize()` in
`src/util/sanitize.ts`. They are generator template output, carried by every project the
kit produces. `assertNotEmpty` exists twice, byte-identical, in `src/common/assertions.ts`
and `src/util/assertions.ts`.

### There are no business rules

Because `evolve` is a no-op and `decide` ignores state:

- `AddTask` succeeds against a list that was never defined;
- `ResolveTask` succeeds for a task that does not exist;
- `DeleteTask` succeeds twice in a row;
- `DefineList` succeeds a second time on an existing stream.

The unit tests are green because they assert that a function returning a constant returns
that constant.

### Stream naming is inconsistent

Command handlers use the raw `:id` from the URL as the stream name
(`AddTaskCommandHandler(eventStore, id, ...)`), while the projection tests write metadata
with `stream_name: 'todolist-<id>'`. Nothing prefixes or namespaces streams.

### `name` is required by the schema but never validated

`tasks.name` and `todo_lists.name` are `TEXT NOT NULL`. A POST without a body `name`
reaches the inline projection, which fails the insert, which fails the append — surfacing
as the route's hand-rolled 500 rather than a 400.

---

## Decisions

| # | Decision |
|---|---|
| 1 | Refactor the sample **and** write up feedback for the kit and for Emmett. |
| 2 | Full dependency injection: `api(eventStore, deps)`, `handleX(eventStore, id, command)`. |
| 3 | Two PRs. **PR 1** the minimum set of changes — tests first, then every deletion and fix. **PR 2** full Emmett mode. |
| 4 | `requireUser` is injectable, so integration tests run with a stub and e2e runs with real Supabase. |
| 5 | Integration tests use `ApiSpecification` with a **per-slice** app and a testcontainers Postgres. |
| 6 | E2E uses `ApiE2ESpecification` against the **real composed** app with real Supabase, covering **every route**. The two specifications differ in setup and assertion style, not in coverage. |
| 7 | Suffixes carry the level: `*.unit.test.ts`, `*.int.test.ts`, `*.e2e.test.ts`, co-located with the slice. |
| 8 | `npm test` runs unit only; `test:int` and `test:e2e` are separate. |
| 9 | The tests pin today's behaviour, including the odd parts, before anything is removed. PR 1's only success-path change is stream naming, which is invisible over HTTP. |
| 10 | Business rules are out of scope; the absence of them is reported as a finding. |
| 11 | Slice internals stay as generated — each slice keeps its own `State`, `evolve` and `CommandHandler`. Only routes and infrastructure change. |
| 12 | No project-local route helper. Routes shrink by deletion in PR 1, then adopt `on` and the response helpers in PR 2. |
| 13 | PR 1 changes behaviour only on the error path; every success-path contract change lands together in PR 2. |
| 14 | Streams are namespaced as `todolist-<id>` in PR 1's first commits. Breaking for existing data, no migration — stated, not hidden. |
| 15 | Knex is a builder that never connects; projections return `RawSQL` and Emmett executes it on the append transaction. |

---

## PR 1 — The minimum set of changes

Everything that is a deletion, a fix, or plumbing. No new idiom, no contract change a
happy-path client would notice. It is one PR, ordered internally as two runs of commits:
**first the net** (§1.0–§1.9), so the changes that follow are made against tests rather
than against hope, **then the removals** (§1.10–§1.20).

### Part A — make it testable, then test it

The regression net for everything that follows. The HTTP contract is untouched: same
routes, same status codes, same response bodies, same headers. One internal change goes in
first — stream naming (§1.0) — because the tests should pin the right names rather than
pin a bug and rewrite it later in the same PR.

### 1.0 Stream naming

Handlers pass the raw URL `:id` as the stream name, while the generated projection tests
already assume `todolist-<id>`. Nothing namespaces streams, so a todolist and any future
aggregate collide on the same id.

```ts
// src/slices/todolist/TodoListEvents.ts
export const toTodoListStreamId = (id: string): string => `todolist-${id}`;

// every handler
await handleAddTask(eventStore, toTodoListStreamId(id), command);
```

**This is a breaking change for existing data.** Streams already written under bare ids
keep those names and no migration is provided — acceptable for a sample, and stated here
so nobody mistakes it for a safe rename. It is the one behavioural change in PR 1, it is
invisible over HTTP, and it makes the handlers agree with the projection tests that were
already written against the prefixed form.

### 1.1 Inject the event store

```ts
// src/slices/todolist/addtask/AddTaskCommand.ts
export const handleAddTask = async (
  eventStore: PostgresEventStore,
  id: string,
  command: AddTaskCommand,
) => { /* body unchanged, minus the findEventstore() call */ };

// src/slices/todolist/addtask/routes.ts
export const api = (eventStore: PostgresEventStore, deps: SliceDeps = {}): WebApiSetup =>
  (router: Router): void => { /* ... handleAddTask(eventStore, id, command) ... */ };
```

Applies to all four command slices. The query slices take their Knex instance the same
way: `api(eventStore, { db })`, defaulting to `getKnexInstance()`.

`server.ts` resolves the store once, as it already does, and passes it in:

```ts
const module = webApiModule.api(eventStore);
```

`findEventstore()` stays as the production composition root. It is not deleted.

The parameter is `PostgresEventStore`, not the generic `EventStore`: the handlers return
`lastEventGlobalPosition`, which the generic interface does not declare
([Upstream #8](#upstream)).

### 1.2 Inject authentication

```ts
// src/supabase/requireUser.ts
export type Authenticate = (req: Request) => Promise<RequireUserResult>;
export const supabaseAuthenticate: Authenticate = async (req) => { /* existing logic */ };
export const requireUser = async (
  req: Request,
  res: Response,
  authenticate: Authenticate = supabaseAuthenticate,
) => { /* calls authenticate, sends the 401 */ };
```

`sendUnauthorized` goes with it. It was a boolean trap: `requireUser` did two jobs —
resolve the caller and write a 401 — and the flag toggled the second, so every call site
had to know which half it was getting. Exactly one caller passed `false` (`/api/user`),
and it then re-checked `res.headersSent` and wrote its own 401 anyway. Once
`supabaseAuthenticate` exists, "resolve the caller without touching the response" has a
name, and the flag has nothing left to express: `/api/user` calls `authenticate(req)`
directly and `requireUser` always sends. Same responses, one less mode.

`SliceDeps` carries an optional `authenticate`; each route passes it through. Production
passes nothing and gets Supabase. Tests pass a stub:

```ts
// src/testing/stubAuth.ts
export const allowAnyUser: Authenticate = async () => ({
  user: { id: 'test-user', email: 'test@example.com', user_metadata: {} },
  error: null,
});
```

The closed-by-default gate in `server.ts` keeps its logic and gets the same seam threaded
through it: `requireUser(req, res, authenticate)`, where `authenticate` defaults to
Supabase. Without that, `createApp({authenticate})` would stub the slices and leave the
gate talking to the network — a knob that half-works. Production behaviour is unchanged,
and e2e still exercises the gate for real.

### 1.3 Test infrastructure

New `src/testing/`:

| File | Purpose |
|---|---|
| `postgresTestDatabase.ts` | Start a Postgres container once per run, apply `_V0__supabase_stubs.sql`, run Flyway, return the connection string. |
| `flywayMigrate.ts` | Run Flyway as a Docker container (`flyway/flyway`) on the same network as the Postgres container, with `supabase/migrations` bind-mounted. Replaces the `execSync('flyway ...')` in `src/common/testHelpers.ts`. |
| `stubAuth.ts` | `allowAnyUser`, and a `rejectAll` for the 401 case. |
| — | No test-only event store. `findEventstore()` was split into `createEventStore(connectionString, pool?)` plus the memoised production caller, so tests build the real thing against the container instead of a parallel copy. |

The container is started in a `before()` hook shared per test file. `ApiSpecification`'s
`getEventStore` and `getApplication` are both synchronous
(`emmett-expressjs/src/testing/apiSpecification.ts:88-92`), so everything awaited happens
in `before()` and the callbacks return already-built values.

Add `supertest` and `@types/supertest` as devDependencies (`emmett-expressjs` imports
supertest but the sample should depend on it explicitly).

### 1.4 Test naming and scripts

Rename:

- `AddTask.test.ts` → `AddTask.unit.test.ts` (same for `DefineList`, `ResolveTask`, `DeleteTask`)
- `Tasks.test.ts` → `Tasks.int.test.ts`, `TodoLists.test.ts` → `TodoLists.int.test.ts`
  (they were always integration tests — container plus migrations)

```json
"test":      "npm run test:unit",
"test:unit": "tsx --test 'src/**/*.unit.test.ts'",
"test:int":  "tsx --test 'src/**/*.int.test.ts'",
"test:e2e":  "tsx --test 'src/**/*.e2e.test.ts'",
"test:all":  "npm run test:unit && npm run test:int && npm run test:e2e"
```

`npm test` then needs neither Docker nor Flyway.

### 1.5 Integration tests — per slice

One `*.int.test.ts` per slice, co-located, each building only its own slice:

```ts
const given = ApiSpecification.for<TodoListEvents>({
  getEventStore: () => eventStore,                       // built in before()
  getApplication: (es) => getApplication({
    apis: [api(es, { authenticate: allowAnyUser })],
    enableDefaultExpressEtag: true,
  }),
});
```

Cases to write. Every expectation below is **today's behaviour**, pinned deliberately —
several of them are wrong and are meant to fail loudly when Part B and PR 2 fix them.

**`definelist`**
- empty stream → 201, `{ok: true, next_expected_stream_version: '1'}`, `correlation_id`
  and `causation_id` response headers echo the id; `TodoListDefined` appended
- explicit `correlation_id` request header → echoed back unchanged
- existing stream → 201 again, version `2` *(no "already defined" rule)*
- missing `name` → 500 with `{ok: false, error: 'Server error'}` *(NOT NULL violation
  through the inline projection, not a 400)*

**`addtask`**
- stream with `TodoListDefined` → 201, `TaskAdded` appended
- **stream that never existed → 201** *(no list required — pinning the gap)*
- missing `name` → 500

**`resolvetask`**
- stream with `TaskAdded` → 201, `TaskResolved` appended
- **empty stream → 201** *(resolving a task that does not exist)*
- twice in a row → 201 both times

**`deletetask`**
- stream with `TaskAdded` → 201, `TaskDeleted` appended
- **twice in a row → 201 both times**

**`tasks` / `todolists`** (query slices — `ApiSpecification` too: `existingStream` seeds
the stream, the inline projection fills the read model, `expectResponse` checks the query.
No `expectNewEvents`, because a query appends nothing.)
- empty table → `[]`
- after events are appended through the store → row present, correct shape
- `?_id=` for a known id → the object; for an unknown id → `null` with status 200
- `authenticate: rejectAll` → 401
- the generated `PostgreSQLProjectionSpec` cases are folded in at this level: a resolved
  task leaves the collection, a redefined list shows its new name. Asserting the projection
  directly duplicated what the query proves, and proved less — it never touched the route.

Each command-slice file also asserts the appended events with `expectNewEvents(streamId,
[event])`, not only the response — that is what `ApiSpecification` is for. That assertion
required an Emmett fix to work against a Postgres store ([Upstream #8](#upstream)).

### 1.6 E2E tests — every route, production composition

The two specifications are not different *scopes*. They differ in how a test arranges
state and what it can assert:

| | `ApiSpecification` | `ApiE2ESpecification` |
|---|---|---|
| Setup | events written straight to streams (`existingStream`) | requests through the public API |
| Assertions | the response **and** the events appended by it | the final response only |
| App | whichever one you hand it | whichever one you hand it |

Coverage is a separate choice, and here it is: **every route gets both.** The integration
suite builds a per-slice app so it can seed streams and assert appended events; the e2e
suite runs the same routes through the production composition, black box, with real
Supabase auth.

One `*.e2e.test.ts` per slice, co-located, plus one flow file:

```ts
const given = ApiE2ESpecification.for({
  getEventStore: () => eventStore,
  getApplication: () => app,   // server.ts's own bootstrap, built in before()
});

await given(
  (request) => request.post('/api/definelist/list-1')
    .set('Authorization', `Bearer ${token}`).send({ name: 'Groceries' }),
)
  .when((request) => request.post('/api/addtask/list-1')
    .set('Authorization', `Bearer ${token}`).send({ name: 'Milk' }))
  .then([expectResponse(201, { body: { ok: true } })]);
```

Per-slice e2e cases, all against the production composition:

- **`definelist`** — 201 on a new list; 201 again on an existing one; 401 with no token;
  400-shaped failure with no `name` (500 today, pinned as such — see §1.11)
- **`addtask`** — 201 after a list is defined through the API; 201 with no list defined;
  401 with no token
- **`resolvetask`** — 201 after `addtask`; 201 with nothing to resolve; 401 with no token
- **`deletetask`** — 201 after `addtask`; 201 twice in a row; 401 with no token
- **`tasks`** — 200 with the task after `addtask`; 200 `[]` after `resolvetask`;
  `?_id=` hit and miss; 401 with no token
- **`todolists`** — 200 with the list after `definelist`; `?_id=` hit and miss;
  401 with no token

Plus `todolist.e2e.test.ts` for the whole flow — define → add → query → resolve → query —
and the two composition-level cases that belong to no slice: `GET /api-docs` without a
token returns 200 (public path), and an unknown route returns Problem Details.

The 401 cases are the ones only e2e can prove: the integration suite stubs
`authenticate`, so the closed-by-default gate in `server.ts` is never exercised there.

Skip the whole suite with an explicit message when Supabase is not reachable, rather than
failing.

This requires `server.ts` to expose its composition:

```ts
export const createApp = async (options?: {
  eventStore?: EventStore;
  authenticate?: Authenticate;
}): Promise<Application> => { /* the existing startServer body, minus startAPI */ };

const startServer = async () => startAPI(await createApp(), { port });
if (require.main === module) void startServer();
```

The glob discovery is still in place while Part A is written — §1.16 removes it — which
means these tests run after `npm run build`, exactly as production does. That is the point
of the suite, and the registry change in Part B must keep them green.

Tokens are minted once per run for a user seeded through `supabase/seed.sql`, in the same
`before()` that builds the app.

### 1.7 Fix the replay lookup

`replayProjection` globs `` `**/${projectionName}.{ts|js}` ``. Brace expansion takes
commas, so `{ts|js}` is a literal, the pattern matches nothing, and every call throws
`Projection not found` (`src/common/replay.ts:10`). The endpoint is gated behind
`COMMON_ROUTES_ENABLED`, which is why it has gone unnoticed.

Fix the pattern to `{ts,js}` here — one character, and it makes the endpoint executable
for the first time — with an integration test that replays `TasksProjection` against the
container. §1.16 then replaces the glob entirely with a registry, but a feature that has
never run once should be proven before it is rewritten.

Running it for the first time exposed a second defect behind the first.
`rebuildPostgreSQLProjections(...)` returns a `MessageConsumer`, and `replayProjection`
called `.start()` on it and returned the promise, never calling `.close()`. The consumer's
connection pool was abandoned on every replay — invisible while the function always threw
before reaching it. The test caught it as an `uncaughtException` at teardown: a connection
still live after the container stopped. Fixed with a `try`/`finally` around `start()`.

The test drives `replayProjection` directly rather than mounting `src/common/routes.ts`.
The route calls `requireSysUser`, which has no injection seam, and giving it one means
editing files this section does not own — §1.16 rewrites this module against the registry
anyway, and the route-level test belongs there. `replayProjection` reads `postgresUrl`
from `db.ts` at module load, so the test sets `SUPABASE_DB_URL` in `before()` and reaches
the module through a dynamic `import()`.

### 1.8 CI

The repository has no `.github/` at all, so nothing would run these tests. One workflow,
added in this PR:

```yaml
on: [push, pull_request]
  test-unit:  npm test               # seconds, no services
  test-int:   npm run test:int       # docker: postgres + flyway containers

on: [schedule (nightly), workflow_dispatch]
  test-e2e:   supabase start && npm run build && npm run test:e2e
```

Unit and integration gate every push and pull request — hosted runners have Docker, so
testcontainers and dockerized Flyway need no extra setup. E2E runs nightly and on demand,
because it needs the Supabase CLI and a build, and it is the suite most likely to be flaky
for reasons unrelated to the code. A regression net nothing executes is not a net, so the
workflow ships with the tests rather than after them.

### 1.9 Checkpoint — the net is in place

- `npm test` passes with no Docker and no Flyway on `PATH`
- `npm run test:int` passes from a clean checkout with only Docker running
- `npm run test:e2e` passes with `supabase start` and a built `dist/`
- No route, status code, response body or header changes anywhere
- Every one of the six slices has an `*.int.test.ts` **and** an `*.e2e.test.ts`, plus
  `todolist.e2e.test.ts` for the flow and the composition-level cases
- Every route returns 401 without a token in the e2e suite

---

### Part B — remove what Emmett, Express and TypeScript already cover

Behaviour-preserving except where noted. The Part A tests must stay green, and where they
cannot, the change is called out here.

### 1.10 Errors

Delete the `try`/`catch` from all six route files and let rejections reach
`problemDetailsMiddleware`. Express 5 forwards them without `express-async-errors`.

**Contract change:** the missing-`name` cases stop returning
`{ok: false, error: 'Server error'}` and start returning `application/problem+json`. Those
Part A assertions get updated here — that is the visible payoff, so the diff should show
it.

### 1.11 Validation

Replace both copies of `assertNotEmpty` with Emmett's `assertNotEmptyString` /
`assertPositiveNumber` / `assertUnsignedBigInt`. Delete `src/common/assertions.ts` and
`src/util/assertions.ts`; update `src/common/routes.ts`.

Validate `req.body.name` at the route boundary with `assertNotEmptyString`, which throws
`ValidationError` → **400**, replacing the NOT NULL violation → 500.

### 1.12 JSON serialization

Replace `jsonBigIntReplacer` with Emmett's `JSONReplacers.bigInt`, composed with a
downcast replacer that keeps the current output:

```ts
// src/common/json.ts
const downcastSafeBigInt: JSONReplacer = (_key, value) =>
  typeof value === 'bigint' && Number.isSafeInteger(Number(value))
    ? Number(value)
    : value;

export const jsonReplacer = composeJSONReplacers(
  downcastSafeBigInt,
  JSONReplacers.bigInt,   // stringifies anything the downcast left alone
);
```

**Decision:** keep the downcast. Part B is behaviour-preserving, and Emmett's replacer alone
would stringify `next_expected_stream_version`, changing every command response body and
breaking the Part A tests for no benefit. The composition is four lines and uses Emmett's
own `composeJSONReplacers`. The absence of a built-in option for it is
[Upstream #7](#upstream); if that lands, this file collapses to one line.

`sanitize()` stays — nothing imports it, and it is not something Emmett replaces.

### 1.13 Test harness

Delete `src/common/testHelpers.ts` in favour of the `src/testing/` helpers from Part A,
built on `emmett-postgresql`'s `postgreSQLTestDatabase` / `emmett-testcontainers` plus
dockerized Flyway.

### 1.14 Express setup

**Decision: one application, composed with `configureApplication`.** The current
`rootApp` / `childApp` split exists only because `getApplication` registers routes
immediately, so the auth gate had to live in a parent app. `configureApplication(app,
options)` applies Emmett's defaults *after* the middleware already installed, which is
exactly the ordering needed:

```ts
const app = express();
app.set('json replacer', jsonReplacer);
app.use(cors({ /* unchanged */ }));
app.use(requestLogger);
app.use(authGate);                       // closed by default, public paths exempt

configureApplication(app, {
  apis: webApis,
  enableDefaultExpressEtag: true,        // PR 2 turns this off — ETags become versions
});
```

That removes, in order: the second Express application, the duplicated
`express.json()` (Emmett installs one, the sample installs another on the parent), the
`json replacer` set twice, and the `startAPI(rootApp)` indirection. `/api-docs`,
`/swagger.json` and `/api/user` move above `configureApplication` alongside the other
non-slice routes, which also makes their exemption from the auth gate explicit rather
than string-matched.

### 1.15 Data access — one pool, Knex as a builder only

Three findings, one change. Today there are three connection layers: a Knex pool and a
`pg.Pool` in `src/common/db.ts`, plus dumbo inside the event store running on the `pg.Pool`
it is handed. On top of that, `TasksProjection.evolve` and `TodoListsProjection.evolve`
each create a **new Knex instance per event** and destroy it in a `finally` — a pool per
projected event, created solely to call `.toQuery()`, which never touches a connection.

**Decision: Knex stays as a query builder and stops being a connection pool.**

```ts
// src/common/sql.ts
export const sql = knex({ client: 'pg' });   // builder only — never connects
```

- **Projections** use it at module scope and keep returning `RawSQL` from `.toQuery()`,
  which Emmett executes through `context.execute.batchCommand(sqls)` on the transaction
  that appended the events. The per-event `getKnexInstance(...)` / `db.destroy()` pair
  disappears from both projection files, and with it the second connection: Knex never
  opens one, so the store's transaction client is the only connection in play — which is
  the connection reuse the current code throws away by reconnecting from
  `context.connection.connectionString`.

  Emmett does expose the client for direct use — `PostgreSQLProjectionHandlerContext` has
  `connection.client`, the live `PgClient` of that transaction
  (`postgreSQLProjection.ts:29-54`) — and Knex 3.3 can bind a builder to it with
  `.connection(client)` (`knex/types/index.d.ts:2304`). That path is **not** taken: it
  would mean `evolve` no longer returns `SQL`, moving both slices off
  `postgreSQLRawSQLProjection` and away from Emmett's projection contract. The trade
  accepted in exchange is inlined literals in the projection SQL — escaped by Knex, but
  not bindings.
- **Query slices** build with the same builder and execute through the shared pool, using
  bindings rather than an inlined string:

  ```ts
  const { sql: text, bindings } = sql<TasksReadModel>(tableName)
    .withSchema('public').where({ id }).toSQL().toNative();

  const { rows } = await getSharedPool().query(text, bindings as unknown[]);
  ```

  `.toNative()` keeps `_id` a parameter. Using `.toQuery()` here instead would inline it,
  and while Knex escapes literals correctly, parameterised is the right default for a
  value that arrives from a query string.
- **`getKnexInstance()` is deleted** from `db.ts`, along with its branch of `closeDb()`.
  What remains is `getSharedPool()` — the one pool, already handed to the event store, now
  also serving read-model queries.

Three layers become two, and the second is Emmett's own dumbo sharing our pool.

**Exception to decision 11:** this edits two projection files, which are slice files. The
exception is deliberate and narrow — a connection pool per event is a defect, and a sample
that ships one is a sample readers will copy.

### 1.16 Registries — routes and projections

**Decision: an explicit registry, `src/slices/index.ts`.**

```ts
export const slices = [
  (es: EventStore, deps: SliceDeps) => defineListApi(es, deps),
  (es: EventStore, deps: SliceDeps) => addTaskApi(es, deps),
  // ...
];
```

`server.ts` maps over it. That kills the `dist/` coupling, the build-before-test
requirement, the runtime `typeof webApiModule.api == 'function'` check, and the silent
failure when a slice exports the wrong name — a missing slice becomes a compile error.
The cost is one line per new slice, which the generator writes anyway.

The same treatment applies to projections. `src/slices/projections.ts` exports the
projection map, `findEventstore` registers `Object.values(projections)` inline, and
`replayProjection` looks the name up in it instead of globbing the filesystem — so the
one-character fix from §1.7 is deleted along with the glob, and an unknown projection name
becomes a `NotFoundError` → 404 rather than a bare `Error` → 500.

An Emmett-side discovery mechanism ([Upstream #3](#upstream)) would be better, but this
work cannot depend on unlanded upstream changes, and the registry is what any such
mechanism would have to beat.

### 1.17 Build and run

`npm start` runs `NODE_ENV=production node --require ts-node/register server.ts` —
TypeScript compiled at boot, every boot — while that same file loads its routes from
`dist/**/routes.js`. Production therefore runs an uncompiled entrypoint that imports
compiled slices, and `npm run build` had to have been run regardless.

```json
"build": "tsc",
"dev":   "tsx watch server.ts",
"start": "node --env-file=.env dist/server.js"
```

`ts-node` leaves the production path entirely; `tsx` is already a devDependency and covers
dev. With §1.16 alongside it, the entrypoint and the slices come from one compile and the
`dist/` glob is gone, so the two halves of the inconsistency are fixed together rather than
one now and one later. Check `vercel.json` against the new `start` before merging.

### 1.18 What the routes look like at the end of PR 1

No abstraction is invented in this PR. The routes stay plain Express and get shorter
purely because the work moves to where it already belonged:

```ts
router.post('/api/addtask/:id', async (req: Request<{id: string}>, res: Response) => {
  const auth = await requireUser(req, res, true, authenticate);
  if (auth.error) return;

  const id = assertNotEmptyString(req.params.id);
  const correlationId = req.header('correlation_id') ?? id;

  const result = await handleAddTask(eventStore, id, {
    type: 'AddTask',
    data: { id, name: assertNotEmptyString(req.body.name) },
    metadata: { correlation_id: correlationId, causation_id: id },
  });

  res.set('correlation_id', correlationId);
  res.set('causation_id', id);

  return res.status(201).json({
    ok: true,
    next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
    last_event_global_position: result.lastEventGlobalPosition?.toString(),
  });
});
```

Roughly 40 lines down to roughly 20, with nothing hidden: the `try`/`catch` and the
hand-rolled 500 are gone to Problem Details, and the missing-`name` case now fails as a
400 at the boundary instead of as a NOT NULL violation in the projection. Correlation
handling and the response shape are deliberately still here — they change in PR 2, where
every success-path change lands at once.

### 1.19 Explicitly not deleted

`parseEndpoint.ts`, `hash.ts`, `processorDlq.ts` and `realtimeBroadcast.ts` stay, unused,
because Emmett has no replacement for them. They are reported upstream as generator
output instead.

### 1.20 Acceptance — the whole PR

- All Part A tests pass, except the two missing-`name` cases updated in Part B from 500 to
  400 with Problem Details bodies
- `src/common/assertions.ts`, `src/util/assertions.ts` and `src/common/testHelpers.ts`
  are gone, as is `getKnexInstance()` from `db.ts`
- No `try`/`catch` remains in any `routes.ts`
- No `glob` call remains in `server.ts` or `replay.ts`; adding a slice without registering
  it is a compile error
- `npm start` runs `dist/server.js`; `ts-node` appears nowhere in the production path
- No new abstraction is introduced — every line removed went to something Emmett, Express
  or TypeScript already provides

---

## PR 2 — Full Emmett mode

The invasive changes, protected by the tests and the cleanup that precede them.

### 2.1 Response helpers

Replace hand-written Express handlers with `on` plus the response helpers:

```ts
router.post('/api/definelist/:id', on(async (request) => {
  const id = assertNotEmptyString(request.params.id);
  const result = await handleDefineList(eventStore, id, toCommand(request));
  return Created({ createdId: id, eTag: toWeakETag(result.nextExpectedStreamVersion) });
}));
```

### 2.2 Honest status codes

201 Created for `definelist` and `addtask`; 204 No Content for `resolvetask` and
`deletetask`. All four return 201 today.

### 2.3 Optimistic concurrency through ETags

Return `nextExpectedStreamVersion` as a weak ETag; read `If-Match` with
`getETagValueFromIfMatch` and pass it as `expectedStreamVersion`. Conflicts become 412
through the default mapping. This retires
`next_expected_stream_version` / `last_event_global_position` from the response body.

### 2.4 Correlation and causation

Stop hand-rolling them. Seed Emmett's observability scope from the request and let the
store stamp the metadata:

```ts
await handleDefineList(eventStore, id, command, {
  observability: { context: { correlationId, causationId } },
});
```

**Decision: `Correlation-Id` is the canonical header, and it is not `traceparent`.**

A trace id and a correlation id are not the same thing. A trace is sampled, short-lived,
and rooted anew whenever a flow crosses an async boundary that starts its own trace; a
correlation id names a business flow, is written into event metadata permanently, and is
propagated by Emmett through message metadata into processors that may run hours later.
Deriving one from the other loses the flow the moment the trace ends. They travel
together, separately.

Resolution order for the inbound request, first match wins:

1. `Correlation-Id` — canonical. No `X-` prefix, per RFC 6648.
2. `X-Correlation-Id` — accepted for compatibility with callers that use the de-facto name.
3. `correlation_id` — the sample's current header, accepted so the existing `.http` files
   and any client keep working.
4. The active OTel span's trace id, when one exists. A caller that sent `traceparent` and
   nothing else gets a correlation id that agrees with its trace for the first hop.
5. Generated, which is what almanac does anyway when the scope has no inherited value
   (`scope.ts:109-119`).

`causationId` is **not** read from a header. For a command arriving over HTTP there is no
causing message, so it defaults to the correlation id — again, what almanac already does.
It becomes meaningful only inside processors, where Emmett sets it to the id of the
message being handled.

The response carries `Correlation-Id` only. `causation_id` stops being echoed: it was
always equal to the id in the URL, and it describes an internal message relationship, not
something a client can act on. `x-trace-id` continues to come from `traceIdMiddleware`.

This PR prototypes the middleware in `src/common/correlationMiddleware.ts` with exactly
that behaviour, then proposes it upstream ([Upstream #1](#upstream)); if it lands, the
local file is deleted.

### 2.5 Consequences

The four `.http` files are rewritten for the new statuses and ETag flow. `Location`
headers appear on the 201s. Swagger annotations, if any depend on the body shape, are
updated.

---

## Documentation

The repository has no README. Since the point of the work is to *show* something, the
writing is a deliverable, not a by-product.

**`README.md` — lands with Part A, updated by both PRs.** What the sample is, how the slices are
laid out, the three test levels and how to run each, and what each moving part is for:
Supabase for auth, Flyway for the read-model schema, testcontainers for integration,
inline projections for the query slices.

**`docs/walkthrough.md` — one section per PR, written with that PR.** The before/after in
prose: a command route at ~40 lines, then ~20, then ~12, and for each line that
disappeared, which Emmett or Express feature absorbed it. The interesting content is not
that the file got shorter — it is that `problemDetailsMiddleware` was already installed and
being defeated, that Express 5 needs no `catch`, that `assertNotEmptyString` turns a NOT
NULL violation into a 400, and that a correlation id is not a trace id. Written per PR so
it stays true to what shipped rather than being reconstructed afterwards.

Both are reusable as the basis of a post or talk, which is the second reason to write them
while the reasoning is fresh.

---

## Out of scope

- **Business rules.** `evolve` stays a no-op and `decide` keeps ignoring state. The tests
  pin the current behaviour, gaps included. A fourth PR giving the todolist real state —
  no task on an undefined list, no double resolve, no delete after resolve — is the
  obvious follow-on, but it is a modelling change, not boilerplate reduction.
- **Filing upstream issues.** This document is the deliverable.
- **The `processor` and `webhook` slice types.** No such slice exists in this sample.

---

## Upstream

Each item is something this sample had to hand-roll, with the evidence for it.

### Emmett

**1. A correlation middleware for `emmett-expressjs`.**
Emmett has `correlationId` / `causationId` on the observability scope and stamps them into
recorded metadata, but nothing bridges an HTTP request to that context, and nothing
returns them to the caller. Every application therefore invents its own header names and
its own metadata fields, as this sample did in snake_case.

Proposed API, prototyped in §2.4 of this spec before being offered upstream:

```ts
correlationMiddleware(options?: {
  headers?: string[];        // default ['correlation-id', 'x-correlation-id']
  fallbackToTraceId?: boolean;   // default true
  respond?: boolean;             // default true — sets Correlation-Id on the response
})
```

It seeds the scope context for the request, so `handleCommand` and the store stamp the
metadata without the application passing anything explicitly, and it is the write-side
counterpart to `traceIdMiddleware`.

On the header-name question: `Correlation-Id` canonical, `X-Correlation-Id` accepted,
falling back to the active span's trace id and then to generation. **Not** `traceparent`
itself — a trace id is sampled and short-lived, a correlation id is a permanent property
of a business flow that Emmett already propagates through message metadata across
processors. Deriving one from the other loses the flow when the trace ends. Reasoning in
full at §2.4.

**2. Async `getEventStore` and `getApplication` in the API specifications.**
Both are synchronous (`apiSpecification.ts:88-92`, `apiE2ESpecification.ts:26-27`), but
every real store needs an awaited migration and most real applications compose
asynchronously. Every test therefore needs a `before()` hook and a mutable outer variable.
Accepting `Promise<Store>` and `Promise<Application>` would remove that.

**3. Slice discovery.**
The kit globs compiled `dist/**/routes.js`, which forces a build before any test or dev
run and couples the bootstrap to the output directory. Proposal: a typed registry helper
in `emmett-expressjs` —

```ts
const apis = composeApis(slices, eventStore, deps);   // slices: SliceApi[]
getApplication({ apis });
```

— so the composition stays explicit and type-checked while the repetitive
`import`/`typeof api === 'function'`/`push` loop disappears. Explicitly *not* filesystem
scanning: a registry that fails to compile beats discovery that fails at runtime. This
sample ships its own registry (§1.16); the upstream value is that every generated project
stops writing that loop.

**4. A testcontainers plus migration helper.**
`emmett-postgresql` has `postgreSQLTestDatabase` and there is an `emmett-testcontainers`
package, but nothing helps a project apply *its own* migrations before the projection
tests run. This sample shells out to a global `flyway` binary via `execSync`, which is why
`npm test` needs Flyway on `PATH`.

**5. An authentication seam.**
Every generated route calls an auth function directly, which makes it untestable without a
network call — the single biggest obstacle to writing these tests. Emmett does not need to
own authentication, but a documented pattern (dependencies through `api(...)`, auth as one
of them) in the Express guide would stop each project from rediscovering it. The
`ApiSpecification` docs could show an authenticated slice.

**6. Processor dead-letter support.**
The kit generates `processorDlq.ts` by hand — a `processor_dlq` table and an insert on
failure — because Emmett's processors have no dead-letter concept. Grepping `emmett/src`
for `deadLetter`/`dlq` returns nothing.

**7. A downcast option on the bigint replacer.**
`JSONReplacers.bigInt` stringifies every bigint. APIs that want safe integers as JSON
numbers — as this sample does — have to write their own replacer. An option such as
`bigInt: 'string' | 'number-when-safe'` would cover both.

**8. `WrapEventStore` did not record appends made through a session. Fixed.**
`WrapEventStore` recorded appends by overriding `appendToStream` on the store it wraps
(`emmett/src/testing/wrapEventStore.ts:58`). `CommandHandler` appends through
`withSession` (`handleCommand.ts:177`), and a store that implements `withSession` becomes
the session factory itself (`handleCommand.ts:338-342`), handing the callback the
session's own store. The wrapper was bypassed, `appendedEvents` stayed empty, and
`expectNewEvents` failed for every assertion — correct or not — against
`PostgresEventStore`. `InMemoryEventStore` has no `withSession`, which is why Emmett's own
`api.int.spec.ts` never hit it.

Fixed in this work: `WrapEventStore` now also wraps the store the session yields, sharing
one record of appended events. Unit test in
`emmett/src/testing/wrapEventStore.unit.spec.ts` covers both paths; the whole
`emmett` unit suite (956 tests) stays green. §1.5 uses `expectNewEvents` as intended.

**9. `EventStore` is not a usable injection type.**
`EventStore.appendToStream` returns `AppendToStreamResult`, which carries
`nextExpectedStreamVersion` and `createdNewStream` but not `lastEventGlobalPosition` —
that lives on `AppendToStreamResultWithGlobalPosition`, declared only on
`PostgresEventStore` (`emmett-postgresql/dist/index.d.ts:352-353`). Any handler that
returns the global position therefore cannot be typed against the generic interface, and
making the handler generic over `Store extends EventStore` does not help: the conditional
`AppendStreamResultOfEventStore<Store>` stays unresolved at the definition site. §1.1's
signatures use `PostgresEventStore` for this reason. The generic seam an application is
told to depend on should be the one it can actually depend on.

**10. Documentation gap: testing read-model slices.**
The getting-started integration testing section covers command endpoints against an
in-memory store. It says nothing about testing a query endpoint whose data arrives through
an inline projection — which needs a real store, migrations, and a container. That is the
half this sample struggled with.

### Build kit

**1. The templates emit helpers nothing imports.**
`parseEndpoint.ts`, `hash.ts`, `processorDlq.ts`, `realtimeBroadcast.ts` and `sanitize()`
are dead in this project and presumably in most. Emit them when a slice needs them —
`processorDlq` with a processor, `realtimeBroadcast` with a broadcast — not up front.

**2. `assertNotEmpty` is emitted twice, byte-identical**, in `src/common/assertions.ts`
and `src/util/assertions.ts`. Both duplicate Emmett's `assertNotEmptyString`, and the
generated one throws a bare `Error` → 500 where Emmett's throws `ValidationError` → 400.

**3. `requireUser` ships with a `sendUnauthorized` boolean trap** — one function that both
resolves the caller and writes the 401, with a flag to suppress the writing. The generated
`/api/user` route passes `false` and then re-implements the 401 itself, guarded by a
`res.headersSent` check that can never be true. Emit the two operations separately: one
that answers "who is this", one that answers "reject them".

**4. Generated routes swallow every error.**
The `try`/`catch` → 500 in every template defeats the Problem Details middleware the
template itself installs, and turns Emmett's four mapped error types into one status code.
Express 5 needs no `catch` at all.

**5. Generated deciders ignore state.**
`type State = {}`, a no-op `evolve`, and a `decide` that returns a constant. The generated
unit test then asserts that a constant function returns its constant. The scaffold is fine
as a starting point, but it should be shaped so the modelling gap is visible — a `TODO` in
`evolve`, or a generated test named for the rule that is missing.

**6. Generated routes hand-roll correlation and causation** into command metadata under
snake_case names, next to the framework's own `correlationId` / `causationId` fields.
Whatever lands as Upstream #1 should replace this template.

**7. Stream naming has no convention.** Handlers use the raw URL `:id` as the stream name,
while generated projection tests write `stream_name: 'todolist-<id>'`. The two disagree.

**8. Generated tests are all named `*.test.ts` regardless of what they need to run**, so
container-backed projection tests land in the default `npm test`. A level in the suffix
(`*.unit.test.ts` / `*.int.test.ts` / `*.e2e.test.ts`) and split scripts would fix it.

---

## Sequencing

Two PRs, sequential.

| PR | Contents | Depends on |
|---|---|---|
| 1 | **Part A** stream naming; event store and auth injection; `createApp`; `src/testing/`; renames and scripts; replay glob fix; six `*.int.test.ts`; six `*.e2e.test.ts` plus `todolist.e2e.test.ts`; CI; README. **Part B** drop `try`/`catch`; Emmett assertions and JSON serializer; delete `testHelpers.ts`; `configureApplication`; one pool with Knex as builder; routes and projections registries; compiled production start | — |
| 2 | `on` and the response helpers; honest statuses; ETag concurrency; `correlationMiddleware` seeding the observability scope; `.http` updates; walkthrough section | PR 1 |

Within Part A, the twelve slice test files — six integration, six e2e — are independent of
one another and can be written in parallel once `src/testing/` and the two seams exist.
`todolist.e2e.test.ts` comes last, since it reuses the token and app helpers the per-slice
e2e files establish.

Part B is sequential after Part A and internally ordered as written: errors and validation
first (they change what the tests assert), then the mechanical replacements, then the
registries and the start script, which touch the bootstrap the tests run against.

The Part A / Part B split is a commit boundary, not a merge boundary. It exists so a
reviewer can read "here is the net" and then "here is what it caught", and so no removal is
made against untested code.
