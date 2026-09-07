# Q&A — Less boilerplate + integration testing for the todolist sample

## Q1. Where does the output of this work actually land — what's the artifact you want at the end?

**Options offered:** refactor this sample repo only / sample + feedback upstream / before-after teaching material / Emmett additions only.

**Answer: Sample + feedback upstream.**

Refactor the sample in place, and separately write up what should change in the
`.build-kit` generator templates (the skills that emit these slices) and what
should be added to Emmett itself, so the boilerplate is never generated again.

## Q2. How far do we go to make dependencies injectable?

**Context:** `handleAddTask` calls the `findEventstore()` singleton itself and `api()`
takes no arguments, so an integration test cannot build the app against an in-memory
or throwaway store.

**Options offered:** full injection / swappable singleton / injection + explicit registry.

**Answer: Full injection.**

`api(eventStore, ...deps)` and `handleAddTask(eventStore, id, command)`; `server.ts`
resolves the store once and passes it into each `api()`.

**Plus, upstream:** worth thinking about slice/route *discovery* as an Emmett feature —
but not the current shape of it (globbing compiled `dist/**/routes.js`). Something
convention-based that works without a build step and without the `dist/` coupling.

## Q3. How much of the HTTP contract do we change?

**Context:** command routes return 201 with `{ok, next_expected_stream_version,
last_event_global_position}` and catch every error into a hand-rolled 500, so the
Problem Details middleware installed by `getApplication` never sees anything.

**Options offered:** full Emmett idiom (`on` + `Created`/`NoContent` + ETag) /
idiom but keep the body / idiom + both / full idiom + honest status codes.

**Answer: stage it. Minimal, Express-idiomatic change first; full Emmett mode as a
follow-up PR.**

- Express 5 forwards rejected async handlers to error middleware on its own, so `on`
  is not required to get Problem Details working — dropping the try/catch is enough.
- Keep the response body as it is for now; stay close to plain Express convention.
- Full Emmett mode (`on`, `Created`/`NoContent`, ETag/`If-Match`, honest statuses) is a
  separate follow-up PR. Possibly the event-store resolution change belongs there too.
- Also: check how Emmett handles correlation and causation ids — there is first-class
  support and it should be switched on properly (as Martin does). Open question whether
  a `correlation_id` header is the right choice or whether W3C Trace Context standard
  headers (`traceparent`/`tracestate`) should be used instead.

**Research finding (mine, for the spec):** Emmett already stamps `correlationId`,
`causationId`, `traceId` and `spanId` into recorded message metadata from the ambient
observability scope (`scope.context` in `inMemoryEventStore.appendToStream`, and the
same in the other stores). The sample duplicates this by hand as snake_case
`correlation_id`/`causation_id` fields inside each command's own metadata — a
parallel, non-standard implementation of a feature the framework provides.

## Q4. What lands in PR 1?

**Context:** `ApiSpecification` builds the app itself, so it can only inject a store if
`api()` accepts one. Deferring injection means PR 1's tests must reach the singleton
some other way.

**Options offered:** injection + tests first / tests first with no signature changes /
one PR with everything.

**Answer: tests first, as a regression net. Then boilerplate. Then structure.**

1. **PR 1 — integration tests against the code as it stands**, so later changes have a
   safety net and we can tell whether we broke anything.
2. **PR 2 — reduce the boilerplate**: the Express setup, and the `src/common` /
   `src/util` helpers that Emmett already provides.
3. **PR 3+ — the invasive changes**: code structure (event-store injection, slice
   shape, `on`/`Created`/ETag, correlation/causation through the observability scope).

## Q5. What is the test seam for PR 1?

**Context (two concrete blockers):**
1. `server.ts` calls `startServer()` at module scope and exports nothing, so there is no
   `Application` object to hand to SuperTest; importing it boots a listener, connects to
   Postgres and globs `dist/**/routes.js` (needs a prior build).
2. Every route calls `requireUser`, which makes a live `supabase.auth.getUser(token)`
   HTTP call, so without a running Supabase and a valid JWT every test request 401s.

**Options offered:** export `createApp` + real Supabase / export `createApp` + auth seam /
black-box against a running server.

**Answer: make `requireUser` injectable**, so integration tests can run with no auth or a
different auth, and keep a **separate e2e suite that runs against real Supabase**.

**Follow-up, upstream:** consider whether this belongs in an Express middleware or an
Emmett middleware — to be decided in the "full Emmett mode" follow-up PR.

### Correlation / causation research (answering the open point from Q3)

**What Emmett has.** `ObservabilityContext` carries `correlationId` and `causationId`
(almanac `scopes/scope.ts:45`). A scope inherits them from its parent, or generates a
`correlationId` when absent, with `causationId` defaulting to it (`scope.ts:109-119`).
`handleCommand` seeds them on the command scope and the append inherits them
(`handleCommand.ts:286`); the store writes them into recorded metadata
(`inMemoryEventStore.ts:236`). A caller seeds them with
`observability: { context: { correlationId, causationId } }`.

**What Emmett does not have.**
- No inbound header is ever read. Zero hits for `traceparent` / `tracestate` /
  `X-Correlation-Id` across `emmett`, `emmett-expressjs` and `almanac`. There is no
  built-in path from an HTTP request to a seeded `correlationId`.
- Nothing returns them. The only HTTP-side piece is `traceIdMiddleware` — eight lines
  that write `x-trace-id` from the active OTel span. Neither `correlationId` nor
  `causationId` reaches a response header.
- `propagation: 'links' | 'propagate'` in almanac is OTel span parenting, not W3C header
  propagation.
- W3C ingestion would come from OTel (`@opentelemetry/instrumentation-http` plus a
  `W3CTraceContextPropagator`), not from Emmett. With that configured, an inbound
  `traceparent` yields `traceId`/`spanId` in metadata and `x-trace-id` on the response —
  but `correlationId` still would not be set, since it is Emmett's concept, not OTel's.

**Upstream candidate:** a `correlationMiddleware` in `emmett-expressjs` that reads a
configurable inbound header (or derives from `traceparent`), seeds the scope context, and
echoes both ids on the response. Open: which header names — the sample's snake_case
`correlation_id`, a conventional `X-Correlation-Id`, or W3C `traceparent` plus
`tracestate` for the correlation id.

## Q6. Which store backs the integration tests?

**Context:** the query slices (`tasks`, `todolists`) never touch the event store — they
read Postgres tables via Knex, filled by projections registered `inline` on the store, so
an in-memory store leaves them nothing to read.

**Options offered:** one shared Postgres / split by slice type / in-memory only /
both layered.

**Answer: testcontainers Postgres for integration, real Supabase for e2e — both as close
to the real setup as possible.**

Also worth considering: running Flyway through Docker or a testcontainer rather than
shelling out to a locally installed `flyway` CLI, which is what
`src/common/testHelpers.ts` does today via `execSync`.

## Q7. How do the suites get named, placed and run?

**Context:** the generator has to emit this shape for every future slice, and `npm test`
today (`tsx --test 'src/**/*.test.ts'`) already sweeps in the testcontainers projection
tests, so it needs Docker and a global `flyway` binary.

**Options offered:** Emmett's own co-located convention / keep `.test.ts` and split by
folder / co-located with one suffix and tag filtering.

**Answer: Emmett's convention, but keep this repo's `test` suffix rather than `spec`.**

- `AddTask.unit.test.ts`, `AddTask.int.test.ts` co-located in the slice folder;
  `todolist.e2e.test.ts` for the flow-level suite.
- Scripts split into `test:unit` / `test:int` / `test:e2e`, with `npm test` running the
  unit suite only, so the default command stays fast and needs neither Docker nor Flyway.

## Q8. How do PR 1's integration tests drive the app, and what do they assert?

**Context:** `ApiSpecification.for({ getEventStore, getApplication })` hands the app a
store it created, so it only works once `api()` accepts one — the injection deferred in
Q4. Against a testcontainers Postgres you can avoid that by pointing `SUPABASE_DB_URL` at
the container and letting the existing singleton pick it up.

**Options offered:** plain SuperTest pinning today's contract / pull `ApiSpecification`
forward / SuperTest plus direct stream reads.

**Answer: pull `ApiSpecification` forward.**

Event-store injection moves into PR 1 alongside the auth seam, so the tests are
given/when/then over events from the start and never need rewriting. This revises the
Q4 ordering: PR 1 is now "make the app constructible and testable, then test it", and
the boilerplate reduction of PR 2 follows.

**Constraint found while checking the source:** `getEventStore: () => Store` and
`getApplication: (store) => Application` are both **synchronous**
(`emmett-expressjs/src/testing/apiSpecification.ts:88-92`), while the sample's
`findEventstore()` is async (it awaits `schema.migrate()`) and any `createApp()` would be
async too (it globs route files). So the store must be created and migrated in `before()`
and handed over synchronously.

## Q9. What application do the integration tests construct?

**Options offered:** per-slice app / the real composed app / per-slice plus one
composition test.

**Answer: per-slice app.**

`getApplication({ apis: [api(eventStore, deps)] })` built inside the test — the shape the
Emmett getting-started guide uses. Fast, isolated, synchronous, and each slice's test
documents exactly which dependencies that slice needs. `server.ts`'s global auth gate,
CORS and route discovery are left to the e2e suite.

## Q10. Which helper changes are in PR 2's scope?

**Finding that shaped the question:** five of the nine helpers in `src/common` and
`src/util` are imported by nothing — `parseEndpoint.ts` (both exports), `hash.ts`,
`processorDlq.ts`, `realtimeBroadcast.ts`, and `sanitize()` itself. They are generator
template output carried by every project the kit produces.

**Answer: replace what Emmett already provides; leave the rest alone.**

- **Emmett's assertions.** `src/common/assertions.ts` and `src/util/assertions.ts` are
  byte-identical copies of `assertNotEmpty`. Both go, replaced by
  `assertNotEmptyString` / `assertPositiveNumber` / `assertUnsignedBigInt`, which throw
  `ValidationError` → 400 through Problem Details instead of a bare `Error` → 500.
- **Emmett's JSON serializer.** `jsonBigIntReplacer` → `JSONReplacers.bigInt` /
  `JSONSerializer`. Behaviour differs: Emmett stringifies every bigint, the sample
  downcasts safe integers to numbers, so response bodies change unless the downcast is
  kept. Worth raising upstream as an option on the serializer.
- **The test harness.** `src/common/testHelpers.ts` shells out to a global `flyway`
  binary via `execSync`; replace with Emmett's `postgreSQLTestDatabase` /
  `emmett-testcontainers` plus Flyway in Docker (per Q6).
- **Not deleted:** only helpers with an Emmett replacement are removed. `parseEndpoint`,
  `hash`, `processorDlq` and `realtimeBroadcast` stay, even though nothing imports them
  yet.

## Q11. What does the e2e suite run against?

**My framing was wrong twice and Oskar corrected it.** SuperTest binds a real ephemeral
port either way, so "in-process" was never the distinction; and `ApiE2ESpecification`
does not imply a test-composed app — `getApplication` returns whatever application you
hand it, and `getEventStore` is optional
(`emmett-expressjs/src/testing/apiE2ESpecification.ts:26-27`).

**Answer: the real setup, driven through `ApiE2ESpecification`.**

The e2e suite composes the application the way production composes it — `server.ts`'s
bootstrap, CORS, the closed-by-default auth gate, the `json replacer`, route discovery —
and runs it with real Supabase auth under Emmett's given/when/then helper. It covers what
the per-slice integration tests deliberately skip: the whole
define → add → resolve → delete → query flow, real JWT verification, and the
401-without-a-token case.

Same synchronous constraint as Q8: the real app must be built in `before()` and returned
synchronously from `getApplication`.

## Q12. What form does the upstream feedback take?

**Options offered:** section in spec.md / separate upstream.md with issue drafts / file
the issues via `gh` / Emmett only, skip the kit.

**Answer: an "Upstream" section in spec.md**, covering both Emmett and the build-kit
generator, with the evidence from this sample for each item. No GitHub writes — Oskar
files whatever he agrees with.

Candidate list carried into the spec: correlation middleware; async
`getEventStore`/`getApplication` in the API specifications; slice discovery without
globbing `dist`; a testcontainers + migration helper; an authentication seam; processor
dead-letter support; a `JSONReplacers.bigInt` downcast option.

## Q13. Do the integration tests pin current behaviour, or does the sample get real business rules?

**Context:** every `decide` in the sample ignores state — `evolve` is a no-op returning
`{}` — so `AddTask` succeeds against a list that was never defined, `ResolveTask`
succeeds for a task that does not exist, and `DeleteTask` succeeds twice in a row. There
are no business rules to test.

**Options offered:** pin as-is / pin now and add rules in a later PR / write the tests
against the intended rules and fix the deciders now.

**Answer: pin as-is.**

The tests document what the code does today, including that resolving a nonexistent task
returns 201. That keeps the three PRs honestly about boilerplate and testability, and
leaves the missing rules as a separate, named finding about the generator: a decider that
ignores state is a decider in name only.

---

*Spec written to [spec.md](spec.md).*
## Q14. Corrections after the first draft

**Oskar's correction, two parts.**

1. **E2E coverage was wrong in the draft.** `ApiSpecification` and `ApiE2ESpecification`
   differ in what they expose and how tests are arranged — the first seeds streams and can
   assert appended events, the second is full black box seeded through requests. Coverage
   is an independent choice. So e2e covers **every route**, using the full production
   setup, not one flow test.

2. **No decision may be left open.** "Not a settled proposal" is not acceptable in a spec.

**Resolved as a result:**

- **E2E:** one `*.e2e.test.ts` per slice against the production composition plus
  `todolist.e2e.test.ts` for the flow and the composition-level cases. Every route also
  gets its 401-without-a-token case, which only e2e can prove since the integration suite
  stubs `authenticate`.
- **Correlation header (§3.4):** `Correlation-Id` canonical (no `X-` prefix, RFC 6648),
  `X-Correlation-Id` and the legacy `correlation_id` accepted, then the active span's
  trace id, then generated. Not `traceparent` itself: a trace id is sampled and
  short-lived, a correlation id is a permanent property of a business flow that Emmett
  propagates through message metadata into processors running much later, so deriving one
  from the other loses the flow when the trace ends. `causationId` is never read from a
  header — for an HTTP command there is no causing message, so it defaults to the
  correlation id. The response echoes `Correlation-Id` only; `causation_id` stops being
  echoed.
- **JSON serializer (§2.3):** keep the safe-integer downcast, composed with
  `JSONReplacers.bigInt` through Emmett's `composeJSONReplacers`. PR 2 is
  behaviour-preserving, and Emmett's replacer alone would stringify
  `next_expected_stream_version` and break PR 1's tests for no benefit.
- **Express setup (§2.5):** one application, `configureApplication(app, options)` after
  cors, logging and the auth gate. Removes the second app, the duplicated
  `express.json()`, the doubled `json replacer` and the `startAPI(rootApp)` indirection.
- **Route discovery (§3.5):** an explicit `src/slices/index.ts` registry. A missing slice
  becomes a compile error instead of a silent runtime skip. The upstream proposal is a
  typed `composeApis` helper — explicitly not filesystem scanning.

## Q15. How much of the per-slice `State` / `evolve` / `CommandHandler` gets shared?

**Context:** the four command slices each declare a private `State`, a no-op `evolve` and
their own `CommandHandler` over the same stream. The kit generates one folder per board
slice, so file layout is not purely a code decision.

**Options offered:** shared decider with per-slice `decide` / full collapse into one
decider / leave the slice files alone.

**Answer: leave the slice files alone.**

Only routes and infrastructure change. Each slice keeps its own `State`, `evolve` and
handler, even where three of the four are identical empty objects — the generator's output
shape stays intact and the board mapping is untouched.

## Q16. Do routes get a project-local helper, or stay explicit?

**Options offered:** explicit routes with Emmett primitives / a project-local
`commandRoute` helper / explicit routes shrunk only by extracting cross-cutting concerns.

**Answer: both, in that order — two PRs.**

1. **PR 2 — shrink by deletion only.** No abstraction is invented. Routes stay plain
   Express and get shorter because the work moves to where it already belonged: the
   `try`/`catch` to Problem Details, validation to `assertNotEmptyString`, auth to the
   gate.
2. **PR 3 — then adopt Emmett's primitives.** `on` plus `Created`/`NoContent`, with the
   flow still visible top to bottom.

No project-local `commandRoute` helper. This sample is teaching material, and Emmett's own
position is that a healthy amount of copy-paste beats magical glue.

**Consequential split, decided:** PR 2 changes behaviour only on the *error* path
(500 → 400/403/404/412 with Problem Details bodies). Every deliberate change to the
*success* path — status codes, ETags, the `Correlation-Id` response header — lands
together in PR 3, so one PR is reviewable as "nothing a happy-path client sees changed"
and the next as "here is the new contract".

## Q17. How far does PR 2 go into data access?

**Context:** three connection layers — a Knex pool and a `pg.Pool` in `src/common/db.ts`,
plus dumbo inside the event store running on the `pg.Pool` it is handed — and both
projections create a **new Knex instance per event**, destroying it in a `finally`, purely
to call `.toQuery()`.

**Options offered:** fix the per-event churn only / also consolidate the pools / leave
data access out.

**Answer: also consolidate the pools.**

Knex becomes a query builder that never connects (`src/common/sql.ts`), `getKnexInstance()`
is deleted, and read-model queries execute through the shared `pg.Pool` with
`.toSQL().toNative()` bindings so `_id` stays a parameter. Three layers become two, the
second being Emmett's own dumbo on our pool.

This edits two projection files, so it is an explicit, narrow exception to decision 11: a
connection pool per event is a defect, and a sample that ships one is a sample readers
copy.

## Q18. How do the projections talk to Postgres?

**Context:** Emmett hands projections the live transaction client —
`PostgreSQLProjectionHandlerContext.connection.client`
(`postgreSQLProjection.ts:29-54`) — and Knex 3.3 can bind a builder to an external
connection with `.connection(client)` (`knex/types/index.d.ts:2304`). The sample ignores
both and reconnects from `connection.connectionString`.

**Options offered:** Knex builds and Emmett executes / Knex executes on the context's
client / build by default and execute where bindings matter.

**Answer: Knex builds, Emmett executes.**

`evolve` keeps returning `RawSQL` from `.toQuery()`, which Emmett runs through
`context.execute.batchCommand` on the transaction that appended the events. Knex never
opens a connection, so the store's transaction client is the only one in play. Binding
Knex to that client would mean `evolve` no longer returns `SQL`, moving both slices off
`postgreSQLRawSQLProjection` and away from Emmett's contract. Accepted cost: inlined
literals in projection SQL, escaped by Knex but not bindings.

## Q19. Stream naming — fix it, and where?

**Context:** handlers pass the raw URL `:id` as the stream name while the generated
projection tests already assume `todolist-<id>`. Nothing namespaces streams, so a todolist
and any future aggregate collide on the same id.

**Options offered:** fix in PR 3 / fix in PR 1 / report only / fix plus a migration.

**Answer: fix in PR 1.**

A `toTodoListStreamId(id)` helper beside `TodoListEvents.ts`, used by all four handlers,
so the regression net pins the right names from the start instead of pinning a bug and
rewriting it two PRs later. It is invisible over HTTP but **breaking for existing data**:
streams already written under bare ids keep those names and no migration is provided. The
spec says so plainly rather than letting it read as a safe rename.

## Q20. What happens to the replay endpoint?

**Finding:** `replayProjection` globs `` `**/${projectionName}.{ts|js}` ``. Brace expansion
takes commas, so `{ts|js}` is a literal, the pattern matches nothing, and every call throws
`Projection not found` (`src/common/replay.ts:10`). The endpoint is gated behind
`COMMON_ROUTES_ENABLED`, which is why nobody has hit it.

**Options offered:** registry in PR 3 / fix the glob now and add the registry later /
delete the endpoint.

**Answer: fix the glob now, registry later.**

One-character fix in PR 1 with an integration test that actually replays a projection —
a feature that has never executed should not wait two PRs to be proven — then PR 3 deletes
the glob in favour of a `src/slices/projections.ts` registry, which also turns an unknown
projection name into a 404 instead of a 500.

## Q21. Does this work add CI?

**Finding:** the repository has no `.github/` at all, so nothing would run the twelve new
test files.

**Options offered:** unit + int on push with e2e nightly / unit + int only / all three on
every push / no CI.

**Answer: unit and integration on every push and pull request, e2e nightly and on
`workflow_dispatch`.**

Hosted runners have Docker, so testcontainers and dockerized Flyway work without extra
setup. E2E is scheduled rather than per-push because it needs the Supabase CLI and a
build, and is the suite most likely to fail for reasons unrelated to the code. The
workflow lands in PR 1 with the tests it runs — a regression net nothing executes is not
a net.

## Q22. Does the work produce documentation?

**Context:** the repository has no README at all, and the stated goal is to *show* how the
codebase looks with less boilerplate.

**Options offered:** README only / README plus a before-after walkthrough / README here and
the walkthrough offered to Emmett docs / no docs.

**Answer: README plus a before/after walkthrough.**

`README.md` lands in PR 1 and is updated by each PR: what the sample is, the slice layout,
the three test levels and how to run them, what Supabase, Flyway and testcontainers are
each for. `docs/walkthrough.md` gets one section per PR, written with that PR, showing the
route shrinking from ~40 lines to ~20 to ~12 and naming which Emmett or Express feature
absorbed each disappearing line. Written per PR so it describes what shipped rather than
being reconstructed later, and reusable as the basis of a post or talk.

## Q23. Build and run scripts, and the PR structure

**Finding:** `npm start` runs `NODE_ENV=production node --require ts-node/register
server.ts` — TypeScript compiled at boot — while that same file loads routes from
`dist/**/routes.js`. Production runs an uncompiled entrypoint importing compiled slices,
and `npm run build` had to have been run anyway.

**Answer, two parts.**

1. **Fix both halves together, in PR 2:** `start` becomes `node dist/server.js`, `dev`
   moves to `tsx`, `ts-node` leaves the production path — and the registry lands in the
   same PR, so the `dist/` glob disappears at the same time as the entrypoint changes.
   (`vercel.json` to be checked against the new `start` before merging.)
2. **PR structure corrected.** The split is *minimum set of changes* versus *full Emmett
   mode*, not three arbitrary buckets. Replacing the `dist/` glob with registries is
   plumbing, so it moves out of PR 3 into PR 2. PR 3 keeps only the idiom: `on`,
   `Created`/`NoContent`, honest statuses, ETag concurrency, the correlation middleware,
   and the `.http` updates that follow from them.

## Q24. Correction — two PRs, not three

**Oskar:** "No, I told you it should be 2 PRs."

The three-way split was mine and it was wrong. The line that matters is *minimum set of
changes* versus *full Emmett mode*; "tests" and "cleanup" are not separate deliverables,
they are the same PR done in the right order.

**Structure, corrected:**

- **PR 1 — the minimum set of changes.** Part A (§1.0–§1.9) puts the net in place: stream
  naming, injection, `createApp`, test infrastructure, the twelve test files, the replay
  glob fix, CI, README. Part B (§1.10–§1.20) removes what Emmett, Express and TypeScript
  already cover: the `try`/`catch`, both `assertNotEmpty` copies, `jsonBigIntReplacer`,
  `testHelpers.ts`, the two-app split, the Knex pool, both `glob` calls, and `ts-node` from
  the production path.
- **PR 2 — full Emmett mode.** `on` and the response helpers, honest 201/204, ETag
  concurrency, the correlation middleware, and the `.http` updates that follow.

Part A / Part B is a **commit boundary, not a merge boundary** — it exists so a reviewer
reads "here is the net" then "here is what it caught", and so no removal is made against
untested code.

