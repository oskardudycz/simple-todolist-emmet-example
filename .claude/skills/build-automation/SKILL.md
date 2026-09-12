---
name: build-automation
description: Implements an emmett automation slice (reactor processor + command handler) from a slice.json definition
---

# Build Automation Slice

> Before doing anything else, read the slice definition from `.slices/{Context}/{slicename}/slice.json`. This file is the **source of truth** for which trigger event drives the automation and what command it fires.

---

## What an Automation Slice is

An automation slice reacts to events from the event store and fires a command in response. It replaces the old CRON + TODO-list pattern with an event-driven **reactor**.

Architecture:

```
Event Store
    │  (TriggerEvent emitted by another slice)
    ▼
processor.ts   ← reactor — listens, maps, fires command
    │
    ▼
{SliceName}Command.ts   ← command handler (decide/evolve)
    │
    ▼
Event Store   ← new events appended
```

An automation slice is a **state-change slice with a reactor**. Always build the command handler first, then wire the processor.

---

## Step 1 — Read the slice.json

From the slice definition, extract:
- **sliceName** — the command being fired by the automation
- **context** — bounded context
- **processors[]** — each processor defines:
  - `triggerEvent` — the event that starts the automation
  - `command` — the command to fire
  - `processorId` — unique kebab-case identifier
- **commands[]** — command data fields
- **events[]** — events emitted by the command
- **storylines[]** (optional) — narrated walkthroughs; see the note in Step 2
> **Comments & description**: Each element (commands, events, readmodels, processors, screens, tables) carries a `comments: string[]` array (board comments on that node) and a `description` field. The slice itself also has `comments: string[]`. Use these as implementation hints — pass them as code comments, documentation, or validation logic where they add value. When done, resolve each used comment: `POST <BASE_URL>/api/org/<ORG_ID>/boards/<BOARD_ID>/nodes/<nodeId>/comments/<commentId>/resolve` (get comment IDs first via GET on the same path without the last two segments).


---

## Step 2 — Build the command handler

Follow the **build-state-change** skill to create:
- `{SliceName}Command.ts` (Command type, evolve, decide, handle{SliceName})
- `{SliceName}.unit.test.ts` (DeciderSpecification tests)

**Do NOT create a `routes.ts`** for automations — the command is fired internally by the processor, not via HTTP.

Refer to the build-state-change skill for the full command handler structure.

> **Storyline-derived tests**: if slice.json has a `storylines[]` array, build-state-change's Step 4b applies here too — treat the trigger EVENT beat as the "given" and the fired command's resulting EVENT beat(s) as "then", exactly as it would for an ordinary command-change slice. Skip silently if there's nothing relevant.

---

## Step 3 — Ensure the trigger event type exists

The trigger event must be defined in `[Context]Events.ts`. If it belongs to a different context, import it from that context's events file.

If the trigger event is missing from the union type, add it:

```typescript
// in {TriggerContext}Events.ts
export type {TriggerEventName} = Event<'{TriggerEventName}', {
    id: string;
    // fields the processor will use to construct the command
}, CommonMeta>;

export type {TriggerContext}Events = /* existing */ | {TriggerEventName};
```

---

## Step 4 — Create `processor.ts`

File: `src/slices/{context}/{SliceName}/processor.ts`

```typescript
import {type {TriggerEventName}} from '../{TriggerContext}Events';
import {to{Context}StreamId} from '../{Context}Events';
import {{SliceName}Command, handle{SliceName}} from './{SliceName}Command';
import {PostgresEventStore, PostgreSQLEventStoreConsumer} from '@event-driven-io/emmett-postgresql';
import {getPgPool, knexInstance, postgresUrl} from '../../../common/db';
import {storeDlqMessage} from '../../../common/processorDlq';
import {v4} from 'uuid';

const PROCESSOR_ID = '{unique-kebab-case-processor-id}';

// getPgPool returns the pool already opened for this connection string, so the DLQ writer
// shares the event store's pool instead of opening a second one.
const db = knexInstance(getPgPool(postgresUrl));

let _consumer: PostgreSQLEventStoreConsumer<{TriggerEventName}> | null = null;

export const processor = {
    start: async (eventStore: PostgresEventStore) => {
        _consumer = eventStore.consumer<{TriggerEventName}>();

        _consumer.reactor<{TriggerEventName}>({
            processorId: PROCESSOR_ID,
            processorInstanceId: v4(),   // new UUID each restart — enables competing consumers
            canHandle: ['{TriggerEventName}'],
            lock: {
                timeoutSeconds: 30,
                acquisitionPolicy: {type: 'retry', retries: 60, minTimeout: 1000, maxTimeout: 2000},
            },
            eachMessage: async (message) => {
                try {
                    console.log(`Processing ${message.type} for ${message.data.id}`);

                    const command: {SliceName}Command = {
                        type: '{SliceName}',
                        data: {
                            id: message.data.id,
                            // map fields from message.data to the command's data shape
                        },
                        metadata: {
                            correlation_id: message.data.id,
                            causation_id: message.metadata?.correlation_id,
                        },
                    };

                    await handle{SliceName}(eventStore, to{Context}StreamId(message.data.id), command);
                } catch (err) {
                    console.error(`${PROCESSOR_ID}: failed to process message`, message.data, err);
                    await storeDlqMessage(db, PROCESSOR_ID, message, err);
                }
            },
        });

        _consumer?.start().catch(err =>
            console.error(`${PROCESSOR_ID} consumer error:`, err),
        );

        return _consumer;   // returned so tests can await whenStarted()/whenProcessed()
    },

    stop: async () => {
        await _consumer?.stop();
    },
};
```

### Key decisions when filling in the template

**`PROCESSOR_ID`** — unique kebab-case string identifying this processor across restarts. Use format: `{slicename}-automation` (e.g. `assign-user-to-organization-automation`). Never reuse IDs between processors.

**`processorInstanceId`** — `v4()` UUID generated at startup. A new UUID each time the server restarts allows multiple competing consumers to run safely in parallel.

**`canHandle`** — must list only the exact event type string(s) this reactor listens to.

**`lock`** — do not change the lock configuration unless there is a specific reason. The defaults provide safe at-least-once delivery with retry.

**Metadata mapping:**
- `correlation_id` in the command → pass the trigger message's `id` (aggregate identifier)
- `causation_id` in the command → pass the trigger message's `metadata?.correlation_id`

**DLQ** — always wrap `eachMessage` in try/catch and call `storeDlqMessage(db, ...)` on failure. Failed messages are not retried automatically; the DLQ record allows manual reprocessing.

### Testing the processor

Step 2's command handler is unit-tested with `DeciderSpecification`, exactly as in **build-state-change**. Add `{SliceName}.int.test.ts` for the reactor itself: append the trigger event, let the processor run, assert the command fired.

The consumer returned by `start` makes that deterministic — `whenStarted()` resolves once it is polling, and `whenProcessed(position)` resolves once every processor has handled up to an append's `lastEventGlobalPosition`. Never sleep or poll in these tests.

```typescript
import {after, before, describe, it} from 'node:test';
import assert from 'assert';
import type {PostgresEventStore} from '@event-driven-io/emmett-postgresql';
import {PostgresTestDatabase, startPostgresTestDatabase} from '../../../testing/postgresTestDatabase';
import {createEventStore} from '../../../common/loadPostgresEventstore';
import {to{Context}StreamId} from '../{Context}Events';
import {to{TriggerContext}StreamId} from '../{TriggerContext}Events';
import {processor} from './processor';

describe('{SliceName} Processor Specification', () => {
    let database: PostgresTestDatabase;
    let eventStore: PostgresEventStore;
    let consumer: Awaited<ReturnType<typeof processor.start>>;

    before(async () => {
        database = await startPostgresTestDatabase();
        eventStore = await createEventStore(database.connectionString);

        consumer = await processor.start(eventStore);
        await consumer.whenStarted();
    });

    after(async () => {
        await processor.stop();
        await eventStore?.close();
        await database?.stop();
    });

    it('fires {SliceName} on {TriggerEventName}', async () => {
        const id = '{slicename}-int-1';

        const {lastEventGlobalPosition} = await eventStore.appendToStream(
            to{TriggerContext}StreamId(id),
            [{type: '{TriggerEventName}', data: {id}}],
        );

        await consumer.whenProcessed(lastEventGlobalPosition, {timeout: 10_000});

        const stream = await eventStore.readStream(to{Context}StreamId(id));
        assert.ok(stream.events.some((event) => event.type === '{EmittedEventName}'));
    });
});
```

An automation has no HTTP surface, so it gets no e2e test of its own — it is exercised end to end by the e2e test of the slice whose command emits the trigger event.

---

## Step 5 — Register the processor in application startup

Find the app startup file (usually `src/index.ts` or `src/server.ts`) where other processors are started. Add:

```typescript
import {processor as {SliceName}Processor} from './slices/{context}/{SliceName}/processor';

// during startup, after eventStore is initialized:
await {SliceName}Processor.start(eventStore);

// during shutdown:
await {SliceName}Processor.stop();
```

The `eventStore` instance is the one returned by `findEventstore()` — reuse the shared instance, do not create a second one.

---

## Step 6 — Verify the event store bootstrap

The event store **must** call `schema.migrate()` before any processor starts. Check `src/common/loadPostgresEventstore.ts`:

```typescript
export const findEventstore = async () => {
    // ...
    await eventStoreInstance.schema.migrate();  // ← must be present
    return eventStoreInstance;
};
```

If this line is missing, add it. Without it, the emmett schema functions (`emt_try_acquire_processor_lock` etc.) are not created and the reactor will fail to start.

---

## Processor patterns reference

### Single trigger event → single command (standard)

```typescript
eachMessage: async (message) => {
    const command: MyCommand = {
        type: 'MyCommand',
        data: {id: message.data.id},
        metadata: {
            correlation_id: message.data.id,
            causation_id: message.metadata?.correlation_id,
        },
    };
    await handleMyCommand(message.data.id, command);
},
```

### Conditional processing (skip if condition not met)

```typescript
eachMessage: async (message) => {
    if (!message.data.someField) {
        console.log(`Skipping — someField not set for ${message.data.id}`);
        return;
    }
    // proceed normally
},
```

### Multiple commands from one trigger

```typescript
eachMessage: async (message) => {
    await handleFirstCommand(message.data.id, firstCommand);
    await handleSecondCommand(message.data.id, secondCommand);
},
```

---

## Files to create / modify

```
src/slices/{context}/{SliceName}/
├── {SliceName}Command.ts    ← command handler (decide/evolve/handle) — see build-state-change
├── {SliceName}.unit.test.ts ← DeciderSpecification tests — see build-state-change
├── {SliceName}.int.test.ts  ← reactor test: append trigger, await whenProcessed, assert
└── processor.ts             ← reactor (start/stop)

src/
└── index.ts (or server.ts)  ← register processor.start() / processor.stop()

src/common/
└── loadPostgresEventstore.ts ← verify schema.migrate() is called
```

---

## Checklist

- [ ] `PROCESSOR_ID` is unique across all processors in the codebase (grep to verify)
- [ ] `processorInstanceId` uses `v4()` — not a hardcoded string
- [ ] `canHandle` matches the exact event type string from `{Context}Events.ts`
- [ ] `eachMessage` is wrapped in try/catch with `storeDlqMessage(db, ...)` fallback
- [ ] The command handler is called as `handle{SliceName}(eventStore, streamId, command)` — the
      processor already has `eventStore` from `start`, it must not call `findEventstore()`
- [ ] `start` returns the consumer, so the int test can await `whenStarted()`/`whenProcessed()`
- [ ] `{SliceName}.int.test.ts` awaits `whenProcessed(lastEventGlobalPosition)` — no sleeps, no polling
- [ ] Processor registered in application startup (start + stop)
- [ ] `schema.migrate()` is called in `loadPostgresEventstore.ts`
- [ ] No `routes.ts` created (automations are not exposed via HTTP)
- [ ] Command handler tests cover idempotency (what happens if the command fires twice)
- [ ] If `storylines[]` is present, storyline-derived command-handler tests were added per build-state-change's Step 4b (or skipped with a documented reason)
- [ ] Every processor in `processors[]` has a corresponding `processor.ts` implementation
- [ ] Command data fields map exclusively from fields available on the trigger event per slice.json — no invented mappings
- [ ] No filtering conditions were invented — all conditions come from slice.json `description` or `comments`
- [ ] No field names were assumed or guessed — if a field is not in slice.json, it is not in the code