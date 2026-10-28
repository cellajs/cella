# Jobs worker

This document covers the jobs worker: the app's **job store on pg-boss**, where periodic sweeps run as cron and per-request work waits on queues.

### TL;DR

Modules declare cron jobs and queues the way they declare routes. One jobs worker per deployment schedules the cron, supervises the store and works the template's queues; the API only enqueues. The store is a PostgreSQL schema the migrate companion installs, so no worker ever migrates it and every runtime process connects as the runtime role.

## How it fits

```text
API process (producer)                 jobs worker (maintainer)
  send('webhook.deliver', { id })        cron: one job per period per schedule
        │                                supervise: expiry, retries, retention
        ▼                                work: handlers of the declared queues
PostgreSQL schema pgboss  ◀──────────────────────┘
  queue · job · schedule · version
        ▲
        └── a consumer process works its own queues (MODE of its own)
```

The jobs worker runs from the backend image. Cron and supervision belong to exactly one process, so it cuts over stop-first, and nothing routes to it.

## Declaring jobs and queues

A cron job is `{ name, cron, run }` on `defineBackendModule`, with five cron fields in UTC. A rule that only deletes old rows is no job: it belongs to the database's nightly retention procedure ([Data lifecycle](../cella/ARCHITECTURE.md#data-lifecycle)).

A cron job runs once per period: a run that overruns delays the next one, never overlaps it, and a period missed while no maintainer ran sends one catch-up job. A run that throws is logged, and the next period runs again.

```ts
defineBackendModule({
  name: 'notifications',
  jobs: [{ name: 'notification-digest', cron: '0 * * * *', run: () => runDigest() }],
  queues: [
    { name: 'webhook.deliver', policy: 'stately', retryLimit: 0, deadLetter: 'webhook.deliver.dead', handler: deliver },
    { name: 'webhook.deliver.dead', retentionSeconds: 7 * 24 * 3600 },
  ],
});
```

A queue takes pg-boss's queue options plus a `handler` and its `work` options. The jobs worker runs the handler of every queue that has one; a queue without one belongs to a consumer process. Policy and partitioning are fixed at creation; the other options converge on every start.

Producers call `send` on the process instance:

```ts
const boss = await getPgBoss('producer');
await boss.send('webhook.deliver', { endpointId, activityId }, { singletonKey: `${endpointId}:${activityId}` });
```

Payloads carry ids, never row bodies: the handler re-reads through the query the API uses. `singletonKey` collapses identical work, at the point the queue's pg-boss policy decides.

## Roles and the store

- **Installer**: the migrate companion installs or upgrades the schema as the table owner, grants the runtime role and creates every declared queue.
- **Producer**: the API. It only enqueues.
- **Consumer**: a process that works the queues it owns.
- **Maintainer**: the jobs worker, one per deployment: supervision, cron, queue creation and the template's handlers. It runs as the runtime role too, so index rebuilds, which need the owner, are left to an operator.

## Operating

`/health?depth=full` carries a `jobs` component on the API and on the jobs worker: when the scheduler last ran, and how each queue stands. It degrades, never fails, when the scheduler stalls, a queue grows past its warning size or dead letters wait, so a cutover never blocks on it.

`pnpm jobs` prints the same for an operator without SQL, plus recent failures and the index rebuild statements pg-boss asks for; `--json` for machines. Queues in the store that no module declares are marked, never deleted.

### Connection budget

Every pool of every process, the job store's included, draws on the database's one `max_connections`. Pool maxima are ceilings, not footprints: the managed database's metrics show the real count. Raising the limit restarts an instance that has no standby, so shrink pools first.
