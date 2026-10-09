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

The jobs worker is a `MODE` of the backend image: its own process on `devPorts.jobs` (the `jobs/` package in `pnpm dev`), or folded into the API under `singleVM`. It cuts over stop-first, because pg-boss cron and supervision belong to exactly one process, and nothing routes to it. The API reads the store for `/health` and enqueues through the same runtime role.

## Declaring jobs and queues

A cron job is `{ name, cron, run }` on `defineBackendModule`. The name is also its queue, created with the `singleton` policy: one run per period, and a run that overruns delays the next one, never overlaps it. Cron is five fields in UTC; a period missed while no maintainer ran sends one catch-up job. A throw fails the run and is logged; the next period runs again.

```ts
defineBackendModule({
  name: 'auth',
  jobs: [{ name: 'prune-devices', cron: '0 3 * * *', run: () => pruneDevices() }],
  queues: [
    { name: 'webhook.deliver', policy: 'stately', retryLimit: 0, deadLetter: 'webhook.deliver.dead', handler: deliver },
    { name: 'webhook.deliver.dead', retentionSeconds: 7 * 24 * 3600 },
  ],
});
```

A queue takes pg-boss's queue options plus a `handler` and its `work` options. The jobs worker runs the handler of every queue that has one; a queue without one belongs to a consumer process. A dead-letter target must be declared as a queue too. Policy and partitioning are fixed at creation; the other options converge on every start.

Producers call `send` on the process instance:

```ts
const boss = await getPgBoss('producer');
await boss.send('webhook.deliver', { endpointId, activityId }, { singletonKey: `${endpointId}:${activityId}` });
```

Payloads carry ids, never row bodies: the handler re-reads through the query the API uses. `singletonKey` collapses identical work, and the policy decides at which point: `stately` and `exclusive` keep one waiting job per key, `singleton` keeps one active job per key, `standard` does not deduplicate.

## Roles and the store

- **Installer**: the migrate companion (`MODE=migrate`, `pnpm migrate`, and the API's boot in development) installs or upgrades the schema as the table owner, grants the runtime role and creates every declared queue.
- **Producer**: the API. It only enqueues.
- **Consumer**: a process that works the queues it owns.
- **Maintainer**: the jobs worker, one per deployment: supervision, cron, queue creation and the template's handlers. It runs as the runtime role too. Index rebuilds need the owner, so pg-boss reports bloat and `pnpm jobs` prints the statements for an operator.

## Operating

`/health?depth=full` carries a `jobs` component on the API and on the jobs worker: when the scheduler last ran, and how each queue stands. It degrades, never fails, when no scheduler ran in five minutes, a queue passes its `warningQueueSize`, or dead letters wait, so a cutover never blocks on it.

`pnpm jobs` prints the same for an operator without SQL, plus the schedules with their last job, the last failures with their error, pg-boss warnings and pending index rebuilds; `--json` for machines. Queues in the store that no module declares are marked, never deleted.

### Connection budget

Every pool draws on one limit: the managed instance's `max_connections` of 100, of which the app roles share 97. The CDC replication connection is a WAL sender and does not count.

Under `singleVM` the one backend process holds pool maxima of 20 (API) + 10 (cdc) + 10 (yjs) + 5 and one listener (jobs) = 46, and the migrate companion adds 7 while it runs. Pools open connections on demand and close idle ones, so these are ceilings, not footprints. Cockpit shows the real numbers: `rdb_instance_postgresql_pg_stat_database_numbackends` against `rdb_instance_postgresql_pg_settings_max_connection`; the `PostgreSQLTooManyConnections` alert fires at 80% for ten minutes.

Raising `max_connections` (through the instance `settings` in [postgres-managed.ts](../infra/resources/stores/postgres-managed.ts)) restarts the instance, which has no standby. Shrink pools first.
