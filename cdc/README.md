# CDC worker

This document covers the CDC worker: the service that turns committed Postgres changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, counts,
totals, and live client notifications. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## Vocabulary

Make sure you already read the [Sync engine](../cella/SYNC_ENGINE.md#selective-sync) part.

| Term | Meaning |
| --- | --- |
| **Change** | One insert, update or delete of a row, read from the WAL. The code calls it an event. |
| **Source transaction** | The transaction that made the changes. The worker gets it whole, when it commits. |
| **Position** | A place in the WAL (an LSN). |
| **Slot** | Postgres's bookmark for the worker. Postgres keeps the WAL from the slot's acknowledged position on. |
| **Flush** | The worker's unit of work: the changes of one or more whole source transactions, recorded together, handed to the API, then acknowledged. |
| **Record** | Write what a change leaves in the database: its activity (the audit row), its sequence value, the counters and the stamp on its row. |
| **Acknowledge** | Tell the slot that everything up to a position is recorded. Postgres never delivers it again. |
| **Read again** | Stop reading without acknowledging and start anew. Postgres delivers the same changes again, and what is recorded already is not recorded twice. |
| **Audience** | The rows of one type under one path, which the same clients may read. The API gets one message per audience. |
| **Books** | The numbers the worker keeps in `channel_counters`: the counts, the sequence counter and the frontiers. |
| **Stuck** | Five failures in a row at one position that the change itself caused. |
| **Lost case** | A state the WAL cannot repair: no slot, empty counters, a stuck worker, a rebuild that was interrupted. It ends in a rebuild. |
| **Generation** | A number that moves on whenever the books were rebuilt. A client that holds another one refetches. Each rebuild leaves an **incident**, a row in `sync_incidents`. |

## How it fits

```text
Postgres WAL (`cdc_pub` / `cdc_slot`)
        │
        ▼
parse and normalize rows
        ▼
buffer a source transaction → suppress cascade noise
        ▼
collect whole source transactions into a flush, in commit order
        ▼
wait for the API: without it nothing is recorded
        ▼
record the flush in one transaction: activities, sequence values, counters, row stamps
        ▼
hand to the API → acknowledge the commit of the last source transaction of the flush
```

The API receives the messages on `/internal/cdc` of its internal listener, passes them to its ActivityBus, and fans them out over SSE. Clients order by `seq`, not arrival.

The worker is `cdc/src/`, with the steps above in `pipeline/` and every limit and timing in `constants.ts`. The API's receiving side is `backend/src/lib/cdc-websocket.ts`. Details are documented there, at their declarations.

## Normal flow

### Read

The worker reads one publication through one replication slot. It tracks the tables in the backend's entity and resource table maps and ignores every other table. Drafts never reach it: a product table with a draft lifecycle is published with a row filter, so a row enters the stream when it is published ([Sync engine, Drafts](../cella/SYNC_ENGINE.md#drafts)).

### Collect

The worker holds a source transaction until its commit. That lets it drop the noise a cascade makes: the child deletes that follow a deleted channel. Those rows are no activity, and they still leave the counts of every channel that remains above the deleted one. For an app with product embeddings the worker also drops a host update that does nothing but take a deleted row out of its references; an update that changed anything else stays a change. What remains joins a flush. A flush takes whole source transactions in commit order, and one flush runs at a time. A worker that falls behind stops reading until its pending changes are flushed, so the backlog waits in Postgres and not in the worker.

### Record

A flush is recorded in one transaction of the worker: the activities, the sequence values, the counter changes and the `seq` stamp on each row. Sequence values are reserved per organization, one contiguous range per flush, and go to product creates and updates in commit order across entity types. A soft-delete and a restore count as a delete and a create, for a row's own count and for the uses of the rows it embeds.

Recording happens once per change, however often the change arrives. An activity's id comes from the commit position of its source transaction and the place of the change in it, so a second delivery inserts nothing, and only an inserted activity gets a sequence value and counts.

### Hand over

After the commit the worker hands the changes to the API. A row that is no product (a membership, a tenant, a channel) goes alone and in commit order, because its listeners act on that one row. Product rows go as one message per audience, with a list of its rows. The API turns a list of one into a notification that carries the row's `stx`, so the tab that wrote it recognizes its own change and fetches nothing. For an app with product embeddings the worker then takes a deleted row out of the hosts that referenced it, and counts the uses it removes: that write is its own and comes back through the stream as no activity. Then the worker acknowledges the flush.

## Internal API channel

One WebSocket from the worker to the API carries every change, with entity row data. It must never be reachable from a browser or an external network: the API serves it only on its internal listener, to peers on the private network, checks a shared secret and accepts one worker at a time.

The API sends nothing back. A message the socket took counts as handed over, even when the API dies before it dispatched it. A client learns of that change at its next catchup.

## Failure and recovery

Nothing here stops a write: the REST API and the database work whatever the worker does ([Sync engine](../cella/SYNC_ENGINE.md#resilience)).

The slot is the only durable buffer, and it advances only after a flush committed. After a crash, or any failure, Postgres delivers the unacknowledged changes again. Delivery is **at least once**, recording is **once**: a change that is delivered again changes no activity, counter or sequence value, and its message is sent again with the sequence value its row already holds.

There is one way a failure is handled: the worker acknowledges nothing, forgets what it holds and reads again from the slot's acknowledged position, after a growing delay. Nothing is retried in place and nothing is left out to keep going.

| Failure | What the worker does |
| --- | --- |
| A flush or a change fails | Reads again. A failure that says nothing about the change (the connection, a lock, the API away) is read again for as long as it lasts. Five failures in a row that the change itself caused make the worker stuck: it reports unhealthy and rebuilds. A position that keeps failing for ten minutes is reported unhealthy too, whatever the cause: a failure that passes never makes the worker stuck. |
| The API is away | Records nothing. The stream is held, Postgres keeps the changes, and the worker reads on when the socket is back. |
| Another worker holds the slot (a rolling deploy) | Retries until the slot is free, and reports degraded meanwhile. |
| The WAL cannot help: the slot is gone or invalidated, the counters are empty, or the worker is stuck | A lost case: the worker rebuilds its books from the tables and every client refetches. See [Verify and rebuild](#verify-and-rebuild). |

## Verify and rebuild

The failure handling has three levels and no more. The core records a change once. Whatever fails is read again from the slot. And when the WAL cannot help, or the books turn out wrong, they are rebuilt from the tables. There is one repair, the rebuild; a verify only detects. The worker runs both by itself while writes go on.

Both start with a recount: every counter, counted anew from the tables at one snapshot.

- **Verify** compares the books with the recount, beside the running stream. Right books stay untouched, wrong books are rebuilt. It runs once a day and on `pnpm sync:verify`.
- **Rebuild** replaces the books by the recount, between two flushes, while the worker keeps reading. It runs when a verify found the books wrong, in the lost cases and on `pnpm sync:rebuild`.

A change that commits around the snapshot would count twice, in the recount and from the stream. The worker tells those apart by their transaction: the fence, in `src/services/fence.ts`. Both commands exit 1 when the books were wrong or the worker did not answer.

One verify or rebuild runs at a time. A rebuild starts by itself in these cases; all but the first are checked before every read of the stream:

| Case | What the worker does first |
| --- | --- |
| A verify found the books wrong | Nothing: it rebuilds between two flushes |
| No slot, or one Postgres invalidated, on a database with a history | Makes a new slot at the current position |
| A slot older than its publication | Drops it and makes a new one |
| `channel_counters` is empty on a database with a history (a truncate, a partial restore) | Nothing |
| A rebuild was interrupted: the worker before this one ended inside its fence | Nothing |
| The worker is stuck | Moves the slot to the current position, which gives up its backlog: everything it had not recorded. At most once in ten minutes |

Every rebuild leaves an incident and moves the generation on, and one the worker started by itself logs an error. A generation grows and is never below the clock in minutes, so a database restored from a backup cannot hand out a number a client already holds. The API learns of a new generation from the worker's health push and ends every app stream with `resync`. What a client does then: [Sync engine](../cella/SYNC_ENGINE.md#rebuilt-books).

What a lost case costs: rows changed while the slot was gone, or in a given-up backlog, keep the `seq` they had and get no activity and no notification. Counts, sequence values and every client's data are right again afterwards.

## Operational constraints

- **Adding a tracked table takes two steps:** the backend's entity or resource table map, then rerunning the CDC migration, which builds the publication. Before it reads, the worker checks that publication and table maps match. While they do not, it reads nothing and reports unhealthy with what is wrong.
- **`REPLICA IDENTITY FULL` is mandatory:** a delete needs the old row. Publication column lists are therefore unavailable, and the worker strips large columns itself, so a consumer must tolerate their absence from the row data.
- **Only one worker may read the slot.**
- **A source transaction is held whole, up to 100,000 changes.** A larger one fails, the worker gets stuck on it and rebuilds: its rows are counted and get no activity. Write a backfill in smaller transactions.
- **WAL retention is the recovery margin.** Postgres needs `wal_level=logical` and a `max_slot_wal_keep_size`: without that limit, a worker that is down keeps WAL until the disk is full. A managed provider may not offer the limit: [Deployment](../cella/DEPLOYMENT.md#overview) says what holds then.
- **The worker's role needs `REPLICATION` and an effective RLS bypass** (it owns the tables and none forces row-level security, or it holds `BYPASSRLS`). Without the bypass a `seq` stamp changes zero rows. The worker reads nothing and reports unhealthy while either is missing.
- **The worker cannot hold the API's rows.** A flush locks the product rows it stamps, and server-side timeouts on the worker's sessions make Postgres take those locks back from a worker that hangs or is cut off.

## Reference

### Counter keys

Keys in `channel_counters` are `sequence`, `membership`, or `<e|m>:<metric>:[h:]<type|role>`, where `e` holds entity metrics keyed by product or channel type, `m` holds membership metrics keyed by role, and `h` marks a home-only summary rather than the subtree aggregate.

| Key | Scope | Meaning |
| --- | --- | --- |
| `sequence` | Org-wide | Sequence reservation counter |
| `membership` | Org-wide | Bump-only membership change signal |
| `e:f:{type}` | Subtree | Frontier of rows at or below the node |
| `e:f:h:{type}` | Home-only | Frontier of rows homed at the node |
| `e:c:{type}` | Subtree | Count of countable rows at or below the node |
| `e:c:h:{type}` | Home-only | Count of countable rows homed at the node |
| `e:li:h:{type}` / `e:lu:h:{type}` | Home-only | Last insert and update timestamps |
| `m:c:{role}` / `m:c:total` / `m:c:pending` | Channel | Membership counts |
| `e:c:{host type}` | Embedded row | Live host rows that reference the embedded row. The key is the embedded row's id, not a channel |
