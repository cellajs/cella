# Jobs service

This document covers the jobs service: the app's **job store on pg-boss**, where periodic sweeps run as cron and per-request work waits on queues.

### TL;DR

Modules declare cron jobs and queues the way they declare routes. One jobs service per deployment schedules the cron, supervises the store and works the template's queues; the API only enqueues. The store is a PostgreSQL schema the migrate companion installs, so no worker ever migrates it and every runtime process connects as the runtime role.

## How it fits

```text
API process (producer)                 jobs service (maintainer)
  send('webhook.deliver', { id })        cron: one job per period per schedule
        │                                supervise: expiry, retries, retention
        ▼                                work: handlers of the declared queues
PostgreSQL schema pgboss  ◀──────────────────────┘
  queue · job · schedule · version
        ▲
        └── a second worker service works its own queues (MODE of its own)
```

The jobs service is a `MODE` of the backend image: its own process on `devPorts.jobs` (the `jobs/` package in `pnpm dev`), or folded into the API under `singleVM`. It cuts over stop-first, because pg-boss cron and supervision belong to exactly one process, and nothing routes to it. The API reads the store for `/health` and enqueues through the same runtime role.

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

A queue takes pg-boss's queue options (`policy`, `retryLimit`, `retryDelay`, `retryBackoff`, `expireInSeconds`, `retentionSeconds`, `deadLetter`, `warningQueueSize`, `partition`) plus a `handler` and its `work` options. The jobs service works every queue with a handler; a queue without one belongs to another worker service. A dead-letter target must be declared as a queue too. Policy and partitioning are fixed at creation; the other options converge on every start.

Producers call `send` on the process instance:

```ts
const boss = await getPgBoss('producer');
await boss.send('webhook.deliver', { endpointId, activityId }, { singletonKey: `${endpointId}:${activityId}` });
```

Payloads carry ids, never row bodies: the handler re-reads through the query the API uses. `singletonKey` collapses identical work, and the policy decides at which point: `stately` and `exclusive` keep one waiting job per key, `singleton` keeps one active job per key, `standard` does not deduplicate.

## Roles and the store

- **Installer**: the migrate companion (`MODE=migrate`, `pnpm migrate`, and the API's boot in development) runs `installJobsSchema` on the admin DSN: it installs or upgrades the schema, waits for pg-boss's background index builds, grants `runtime_role` (the `jobs_grants` side-effect block), and creates every declared queue. A queue with `partition: true` gets its own table here, which only the owner can create.
- **Producer**: the API, `migrate: false`, no supervision, a pool of 2.
- **Worker**: a service that works queues it owns, with `LISTEN`/`NOTIFY` wake-ups and a slow poll as the backstop.
- **Maintainer**: the jobs service, one per deployment: supervision, cron, queue creation and the template's handlers. It runs as `runtime_role` too; index rebuilds need the owner, so pg-boss reports bloat and `pnpm jobs` prints the statements for an operator.

Tests use the schema `pgboss_test`, so a test run never touches a development store; `tests/integration/jobs-store.test.ts` proves the grants by enqueuing, working, scheduling and supervising as `runtime_role`.

## Operating

`/health?depth=full` carries a `jobs` component on the API and on the jobs service: when the scheduler last ran, and per queue the live depth, active count, failures in the last hour, the oldest waiting job and the dead-letter depth. It degrades, never fails, when no scheduler ran in five minutes, a queue passes its `warningQueueSize`, or dead letters wait; a cutover never blocks on it.

`pnpm jobs` prints the same for an operator without SQL, plus the schedules with their last job, the last failures with their error, pg-boss warnings and pending index rebuilds; `--json` for machines. Queues in the store that no module declares are marked, never deleted.

## Configuration

| Key | Purpose |
| --- | --- |
| `services.jobs.enabled` | Runs the maintainer; `false` means no cron and no queue is worked anywhere |
| `devPorts.jobs`, `PORT` | `MODE=jobs` selects this entry; the dev entry and the infra env set `PORT` to `devPorts.jobs` (4005) |
| `DATABASE_URL`, `DATABASE_SSL_CA` | The runtime database role every job role uses |
| `DATABASE_ADMIN_URL` | The installer only (the migrate companion); no worker needs it |
| `DATABASE_POOL_MAX` | The API's own pool (default 20); the job store adds a pool of 5 plus one listener connection per worker process |
