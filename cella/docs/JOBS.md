# Jobs

This document covers the jobs service on [pg-boss](https://github.com/timgit/pg-boss): declaring cron jobs and queues, the job store and operating it.

### TL;DR

Modules declare cron jobs and queues the way they declare routes. One jobs service per deployment runs the schedule and the template's queues, and the API only enqueues. The job store is a schema in the app's PostgreSQL database: no broker to run.

## How it fits

The jobs service runs the work no request waits for.

```text
API process (producer)                 jobs service (maintainer)
  send('webhook.deliver', { id })        cron: one job per period per schedule
        │                                supervise: expiry, retries, retention
        ▼                                work: handlers of the declared queues
PostgreSQL schema pgboss  ◀──────────────────────┘
  queue · job · schedule · version
        ▲
        └── a consumer process works its own queues (SERVICE of its own)
```

## Declaring jobs and queues

You declare cron jobs and queues on `defineBackendModule`:

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

A cron job is `{ name, cron, run }`, with five cron fields in UTC. A rule that only deletes old rows is no job of its own: the nightly `retention` job runs it ([Data lifecycle](./ARCHITECTURE.md#data-lifecycle)). A cron job's runs follow four rules:

- One run per period. A missed period sends one catch-up job.
- A run that throws is logged, and the next period runs again.
- Two runs never overlap while each ends within its expiry, the time a run may stay active.
- Past its expiry, a second jobs process can start the next run beside the first.

If your job's runs must not overlap, have each run stop taking work before its expiry.

A queue takes pg-boss's queue options plus a `handler` and its `work` options. The jobs service runs the handler of every queue that has one. A queue without one belongs to a consumer process. Policy and partitioning are fixed at creation, and the jobs service updates the other options at every start.

To enqueue, call `send` on the process instance:

```ts
const boss = await getPgBoss('producer');
await boss.send('webhook.deliver', { endpointId, activityId }, { singletonKey: `${endpointId}:${activityId}` });
```

Send ids, never row bodies: the handler re-reads the row through the query the API uses.

## Roles and the store

Only the installer migrates the job store: every other process connects as the database's runtime role.

- **Installer**: the migrate companion. It installs or upgrades the schema over the admin connection.
- **Producer**: the API. It only enqueues.
- **Consumer**: a process that works the queues declared without a handler.
- **Maintainer**: the jobs service, one per deployment: supervision, cron, queue creation and the template's handlers.

## Operating

The `jobs` component of `/health?depth=full` shows when the scheduler last ran and how each queue stands, on the API and on the jobs service.

The component degrades when the scheduler stalls, a queue backs up or dead letters wait, and names the queues that degrade. It never fails: jobs can wait minutes, and a deploy's switch must not wait on them.

You run index rebuilds, since the maintainer runs as the runtime role. For those and for recent failures, query the job store schema over the admin connection.

### Connection budget

Every pool of every process draws on the database's one `max_connections`, the job store's included. Pool maxima are ceilings, not footprints. The managed database's metrics show the real count. Shrink pools before raising the limit: raising it restarts an instance that has no standby. You set a deployed service's pool size in its `env` in [description.yml](../infra/description.yml).
