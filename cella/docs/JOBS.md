# Jobs worker

This document covers the jobs worker: the app's job store on [pg-boss](https://github.com/timgit/pg-boss), with cron sweeps and queues.

### TL;DR

Modules declare cron jobs and queues the way they declare routes. One jobs worker per deployment schedules the cron, supervises the store and works the template's queues; the API only enqueues. No worker ever migrates the store, and each runtime process opens it as the runtime role. The store is a PostgreSQL schema the migrate companion installs.

## How it fits

```text
API process (producer)                 jobs worker (maintainer)
  send('webhook.deliver', { id })        cron: one job per period per schedule
        │                                supervise: expiry, retries, retention
        ▼                                work: handlers of the declared queues
PostgreSQL schema pgboss  ◀──────────────────────┘
  queue · job · schedule · version
        ▲
        └── a consumer process works its own queues (SERVICE of its own)
```

The jobs worker runs from the backend image. Its own service cuts over stop-first, since cron and supervision belong to one process. Nothing routes to it. Under `singleVM` it runs inside the backend process, which cuts over start-first. A deploy then runs two jobs workers until the old machine is removed.

## Declaring jobs and queues

A cron job is `{ name, cron, run }` on `defineBackendModule`, with five cron fields in UTC. A rule that only deletes old rows is no job of its own: the nightly `retention` job runs it ([Data lifecycle](./ARCHITECTURE.md#data-lifecycle)).

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

A queue takes pg-boss's queue options plus a `handler` and its `work` options. The jobs worker runs the handler of every queue that has one. A queue without one belongs to a consumer process. Policy and partitioning are fixed at creation. The other options converge on every start.

Producers call `send` on the process instance:

```ts
const boss = await getPgBoss('producer');
await boss.send('webhook.deliver', { endpointId, activityId }, { singletonKey: `${endpointId}:${activityId}` });
```

Payloads carry ids, never row bodies. The handler re-reads through the query the API uses.

A cron job runs once per period. A missed period sends one catch-up job. A run that throws is logged, and the next period runs again.

Two runs never overlap while each ends within its expiry. Past its expiry, a second jobs worker can start the next run beside the first. A job whose runs must not overlap stops taking work before its expiry.

## Roles and the store

- **Installer**: the migrate companion. It installs or upgrades the schema as owner and creates the queues.
- **Producer**: the API. It only enqueues.
- **Consumer**: a process that works the queues it owns.
- **Maintainer**: the jobs worker, one per deployment: supervision, cron, queue creation and the template's handlers.

## Operating

`/health?depth=full` carries a `jobs` component on the API and on the jobs worker: when the scheduler last ran and how each queue stands. It degrades when the scheduler stalls, a queue backs up or dead letters wait. It never fails, so a switch never blocks on it.

Index rebuilds are left to an operator, since the maintainer runs as the runtime role. For those and for recent failures, query the job store schema as the owner role. The health payload names the queues that degrade.

### Connection budget

Every pool of every process draws on the database's one `max_connections`, the job store's included. Pool maxima are ceilings, not footprints. The managed database's metrics show the real count. Shrink pools before raising the limit: raising it restarts an instance that has no standby.
