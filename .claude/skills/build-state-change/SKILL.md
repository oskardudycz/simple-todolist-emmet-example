---
name: build-state-change
description: Implements an emmett state-change slice (command handler, tests, route) from a slice.json definition
---

# Build State Change Slice

> Before doing anything else, read the slice definition from `.slices/{Context}/{slicename}/slice.json`. This file is the **source of truth** for all fields, events, and metadata. Never invent fields not defined there.

---

## What a State Change Slice is

A state-change slice processes a command using event sourcing. It:
1. Loads the current aggregate state by replaying past events (`evolve`)
2. Validates the command against that state (`decide`)
3. Returns new events if valid, throws if not

---

## Step 1 — Read the slice.json

From the slice definition, extract:
- **sliceName** — the slice title (becomes the Command name)
- **context** — the bounded context (used to find `[Context]Events.ts`)
- **commands[]** — list of commands with their data fields
- **events[]** — list of events emitted by each command
- **specifications[]** — test scenarios (given/when/then)
- **storylines[]** (optional) — narrated walkthroughs that may yield additional command-handler tests; see Step 4b
> **Comments & description**: Each element (commands, events, readmodels, processors, screens, tables) carries a `comments: string[]` array (board comments on that node) and a `description` field. The slice itself also has `comments: string[]`. Use these as implementation hints — pass them as code comments, documentation, or validation logic where they add value. When done, resolve each used comment: `POST <BASE_URL>/api/org/<ORG_ID>/boards/<BOARD_ID>/nodes/<nodeId>/comments/<commentId>/resolve` (get comment IDs first via GET on the same path without the last two segments).


---

## Step 2 — Ensure the shared events union exists

Each context has one `[Context]Events.ts` file that exports a union of all event types.

File location: `src/slices/{context}/[Context]Events.ts` (or wherever the existing one lives — search for it).

### Event type shape

```typescript
import type {Event} from '@event-driven-io/emmett';

type CommonMeta = {
    stream_name?: string;
    userId?: string;
    correlation_id?: string;
    causation_id?: string;
};

export type {EventName} = Event<'{EventName}', {
    // data fields from slice.json
}, CommonMeta>;

// Add the new event to the union
export type {Context}Events = /* existing events */ | {EventName};
```

Add each new event type and update the union. Do NOT remove existing types.

---

## Step 3 — Create `{SliceName}Command.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}Command.ts`

### Full structure

```typescript
import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type {Context}Events} from '../{Context}Events';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';

// 1. Command type — data fields come from slice.json commands[]
export type {SliceName}Command = Command<'{SliceName}', {
    id: string;
    // ... other data fields from the slice definition
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// 2. State — only fields needed for validation
export type {SliceName}State = {
    // e.g. { processed: boolean } or { assignedIds: Set<string> }
    // Use {} if no validation state is needed
};

export const {SliceName}InitialState = (): {SliceName}State => ({
    // initial values
});

// 3. Evolve — pure function, updates state from past events
export const evolve = (
    state: {SliceName}State,
    event: {Context}Events,
): {SliceName}State => {
    const {type} = event;

    switch (type) {
        case '{EmittedEventName}':
            return {...state, /* update field */};
        default:
            return state;
    }
};

// 4. Decide — validates command, returns events or throws
export const decide = (
    command: {SliceName}Command,
    state: {SliceName}State,
): {Context}Events[] => {
    // idempotency / business rule check
    if (state.processed) {
        throw {code: 'already_processed', message: 'Already processed'};
    }

    return [{
        type: '{EmittedEventName}',
        data: {
            id: command.data.id,
            // ... map all fields from command.data per slice.json
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
            userId: command.data.userId,
        },
    }];
};

// 5. CommandHandler + exported handle function
const {SliceName}CommandHandler = CommandHandler<{SliceName}State, {Context}Events>({
    evolve,
    initialState: {SliceName}InitialState,
});

export const handle{SliceName} = async (
    eventStore: PostgresEventStore,
    id: string,
    command: {SliceName}Command,
) => {
    const result = await {SliceName}CommandHandler(
        eventStore,
        id,
        (state: {SliceName}State) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
```

### State complexity guide

| Scenario | State shape |
|----------|-------------|
| Simple create-once | `{ created: boolean }` |
| Idempotency by user | `{ processedUserIds: Set<string> }` |
| Count validation | `{ count: number; limit: number }` |
| No validation needed | `{}` (empty object) |

---

## Step 4 — Create `{SliceName}.unit.test.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}.unit.test.ts`

> The suffix is what makes the file run: `npm run test:unit` globs `src/**/*.unit.test.ts`,
> `test:int` globs `*.int.test.ts`, `test:e2e` globs `*.e2e.test.ts`. A plain `.test.ts` runs
> in no suite at all.

Use `DeciderSpecification` for unit tests. Derive test scenarios from `specifications[]` in the slice.json.

```typescript
import {DeciderSpecification} from '@event-driven-io/emmett';
import {
    {SliceName}Command,
    {SliceName}InitialState,
    decide,
    evolve,
} from './{SliceName}Command';
import {describe, it} from 'node:test';

describe('{SliceName} Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: {SliceName}InitialState,
    });

    it('spec: {SliceName} - creates event on empty stream', () => {
        const command: {SliceName}Command = {
            type: '{SliceName}',
            data: {
                id: 'test-id',
                // ... test values
            },
            metadata: {},
        };

        given([])
            .when(command)
            .then([{
                type: '{EmittedEventName}',
                data: {
                    id: 'test-id',
                    // ... expected event data
                },
                metadata: {},
            }]);
    });

    it('spec: {SliceName} - throws when already processed', () => {
        const command: {SliceName}Command = {
            type: '{SliceName}',
            data: {id: 'test-id'},
            metadata: {},
        };

        given([{
            type: '{EmittedEventName}',
            data: {id: 'test-id'},
            metadata: {},
        }])
            .when(command)
            .thenThrows();
    });
});
```

Add one test per specification in the slice.json. If the spec has no precondition events, use `given([])`.

---

## Step 4b — Storyline-derived tests (optional)

Some slices also have a `storylines[]` array in slice.json — narrated walkthroughs of one use case as an ordered sequence of beats (`elements[]`). Most slices have no storylines; skip this step silently when `storylines[]` is empty or absent.

A storyline embedded in this slice's slice.json already belongs entirely to this slice — no need to match beats against `commands[]` by id/title. For each storyline, find a `type: COMMAND` beat directly followed by its EVENT beat(s). That pair is a command-handler test — the same shape as the specifications-derived tests above:
- `given` — the cumulative ordered EVENT beats from the start of the storyline up to (but not including) the command beat
- `when` — the command, built from the beat's `fields`
- `then` — the event(s) immediately following the command beat, built from their `fields`

Add these alongside the specifications-derived tests in the same `describe` block, or in their own block named after the storyline's `title` if it helps distinguish them.

A storyline walking COMMAND → EVENT → READMODEL is **not** one test here: the READMODEL half belongs to **build-state-view** — `DeciderSpecification` can only assert emitted events, never read-model state.

Skip (do not fabricate) a segment when the command beat has no immediately-following event beat relevant to this slice, or when the beat's fields don't give enough to construct a valid command.

---

## Step 5 — Create `routes.ts`

File: `src/slices/{context}/{SliceName}/routes.ts`

> **Concrete example**: `src/slices/todolist/addtask/routes.ts`. Read it before implementing.

A command slice takes its dependencies as an argument — the event store and the
authenticator — so tests can hand it a container-backed store and a stub auth. Never call
`findEventstore()` from a handler.

```typescript
import {Request, Response, Router} from 'express';
import {assertNotEmptyString} from '@event-driven-io/emmett';
import {WebApiSetup} from '@event-driven-io/emmett-expressjs';
import {requireUser} from '../../../supabase/requireUser';
import {CommandSliceDependencies} from '../../../common/dependencies';
import {to{Context}StreamId} from '../{Context}Events';
import {{SliceName}Command, handle{SliceName}} from './{SliceName}Command';

export const api = ({eventStore, authenticate}: CommandSliceDependencies): WebApiSetup => (router: Router): void => {

    router.post('/api/{slicename}/:id', async (req: Request<{id: string}>, res: Response) => {
        const auth = await requireUser(req, res, authenticate);
        if (auth.error) return;

        const id = assertNotEmptyString(req.params.id);
        const correlationId = req.header('correlation_id') ?? id;

        const result = await handle{SliceName}(eventStore, to{Context}StreamId(id), {
            type: '{SliceName}',
            data: {
                id,
                // ... map from req.body, validating with assertNotEmptyString etc.
            },
            metadata: {
                correlation_id: correlationId,
                causation_id: id,
            },
        });

        res.set('correlation_id', correlationId);
        res.set('causation_id', id);

        return res.status(201).json({
            ok: true,
            next_expected_stream_version: result.nextExpectedStreamVersion?.toString(),
            last_event_global_position: result.lastEventGlobalPosition?.toString(),
        });
    });
};
```

**Error mapping**: domain errors thrown as `{code, message}` are turned into HTTP responses
by emmett-expressjs' default error handler. Add a `try/catch` mapping to 409 only when a
specification in the slice.json calls for a specific status and body:

```typescript
} catch (err: any) {
    if (err?.code === 'already_processed') {
        return res.status(409).json({error: 'This action has already been performed.'});
    }
    throw err;
}
```

> **Route params on the `Request` generic**: Declare them as `Request<{id: string}>` — Express 5 types `ParamsDictionary` as `{[key: string]: string | string[]}`, so a bare `Request` makes `req.params.id` a `string | string[]`. Code that passes it on as a string will not compile.

### Testing the route

Step 4 covers `decide`. Add `{SliceName}.int.test.ts` for the route itself — the stream id, the appended events and the status code — against a real PostgreSQL container. Put this slice's request builders in `src/testing/{context}Api.ts` and its event builders in `src/testing/{context}Events.ts` rather than hand-rolling them in the test.

> **Concrete example**: `src/slices/todolist/addtask/AddTask.int.test.ts` — copy its shape.

```typescript
import {after, before, describe, it} from 'node:test';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {ApiSpecification, getApplication} from '@event-driven-io/emmett-expressjs';
import {PostgresTestDatabase, startPostgresTestDatabase} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {allowAnyUser} from '../../../testing/stubAuth';
import {appended, created, {requestBuilder}} from '../../../testing/{context}Api';
import {correlatedWith, {eventBuilder}, {streamBuilder}} from '../../../testing/{context}Events';
import {{Context}Events} from '../{Context}Events';
import {api} from './routes';

describe('{SliceName} Api Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let given: ApiSpecification<{Context}Events>;

    before(async () => {
        database = await startPostgresTestDatabase();
        eventStore = await createEventStore(database.connectionString);

        given = ApiSpecification.for<{Context}Events, PostgresEventStore>({
            getEventStore: () => eventStore,
            getApplication: (es) => getApplication({
                apis: [api({eventStore: es, authenticate: allowAnyUser})],
                enableDefaultExpressEtag: true,
            }),
        });
    });

    after(async () => {
        await eventStore?.close();
        await database?.stop();
    });

    it('emits {EmittedEventName}', async () => {
        const id = '{slicename}-int-1';

        await given({streamBuilder}(id))   // given() with no arguments = empty stream
            .when({requestBuilder}(id, {field: 'value'}))
            .then([
                created(1, {correlationId: id, causationId: id}),
                appended(id, [{eventBuilder}(id, 'value', correlatedWith(id))]),
            ]);
    });
});
```

Write one `it` per specification that the route can exercise, plus one for an unauthenticated caller.

---

## Step 6 — Create `{SliceName}.e2e.test.ts`

File: `src/slices/{context}/{SliceName}/{SliceName}.e2e.test.ts`

The same command driven through the whole application — `createApp()`, the real auth gate, a real Supabase JWT.

`getE2EEnvironment()` from `src/testing/e2eEnvironment.ts` signs the e2e user in and builds the app. `scenarioRunner(() => environment)` returns a `scenario(...)` that replaces `it`: it reads the environment at run time and skips the body, with a reason, when Supabase is unconfigured or unreachable — so the suite stays green without credentials. `authenticatedAs(token)` wraps the request builders so every `api.*` call carries the JWT.

> **Concrete example**: `src/slices/todolist/addtask/AddTask.e2e.test.ts` — copy its shape.

```typescript
import {before, describe} from 'node:test';
import {ApiE2ESpecification, expectResponse} from '@event-driven-io/emmett-expressjs';
import {E2EEnvironment, getE2EEnvironment, scenarioRunner} from '../../../testing/e2eEnvironment';
import {authenticatedAs, {requestBuilder}} from '../../../testing/{context}Api';

describe('{SliceName} E2E', () => {
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

    scenario('{SliceName} succeeds', async () => {
        const id = `{slicename}-e2e-${Date.now()}`;

        await given(api.{precedingCommand}(id))
            .when(api.{requestBuilder}(id, {field: 'value'}))
            .then([expectResponse(201, {body: {ok: true}})]);
    });

    scenario('rejects a request without a token', async () => {
        const id = `{slicename}-e2e-anon-${Date.now()}`;

        // the bare builder, not api.*, so no Authorization header is sent
        await given()
            .when({requestBuilder}(id, {field: 'value'}))
            .then([expectResponse(401)]);
    });
});
```

E2E runs against a shared database, so give every scenario a unique id (`${Date.now()}`) instead of the fixed `test-id` the unit tests use.

---

## Step 7 — Wire up the route

Nothing to do. `server.ts` globs `dist/src/slices/**/routes{,-*}.js` and calls each module's exported `api` with `{eventStore, db, authenticate}`. A slice is wired as soon as the file exists and exports an `api` that accepts that object.

---

## Key patterns

- **Metadata optional chaining**: always use `command.metadata?.correlation_id` (metadata may be absent in tests)
- **Throw with code**: `throw {code: 'snake_case_code', message: '...'}` — routes catch by `err?.code`
- **Idempotency in evolve**: track processed IDs in state, check in decide
- **Stream ID**: the route builds it with `to{Context}StreamId(id)` from `{Context}Events.ts` and passes it to `handle{SliceName}(eventStore, streamId, command)` — the stream is `{context}-{id}`
- **Dependencies are injected**: `api({eventStore, authenticate})`; the handler never calls `findEventstore()`
- **No side effects in evolve**: evolve must be a pure function; all side effects go in decide or the route

---

## Files to create

```
src/slices/{context}/{SliceName}/
├── {SliceName}Command.ts      ← command handler (decide/evolve/handle)
├── {SliceName}.unit.test.ts   ← DeciderSpecification tests
├── {SliceName}.int.test.ts    ← ApiSpecification tests over a real container
├── {SliceName}.e2e.test.ts    ← same command through the whole app and real Supabase
└── routes.ts                  ← Express POST endpoint

src/testing/
└── {context}Api.ts            ← add this slice's request builders

src/slices/{context}/
└── {Context}Events.ts       ← add new event types here (update union)
```

---

## Final Verification: Does the Implementation Match slice.json?

Before marking this slice as `Done`, verify the implementation against slice.json:

- [ ] Every field in `commands[].data` has a corresponding field in the Command type — no invented fields, none missing
- [ ] Every event in `events[]` has a corresponding type in `{Context}Events.ts` — names match exactly
- [ ] All three test files exist — `.unit.test.ts`, `.int.test.ts`, `.e2e.test.ts`; the suffix decides which suite runs them
- [ ] E2E scenarios use `scenario`, not `it`, and unique ids — e2e runs against a shared database
- [ ] Every field in each event's data has a corresponding field in the TypeScript event type
- [ ] Every entry in `specifications[]` maps to a test case in `{SliceName}.unit.test.ts`
- [ ] If `storylines[]` is present, each command-to-event transition relevant to this slice has a corresponding test (or a documented reason it was skipped)
- [ ] No business rules, defaults, or constraints were added that do not appear in slice.json `description` or `comments`
- [ ] No field names were assumed or guessed — if a field is not in slice.json, it is not in the code