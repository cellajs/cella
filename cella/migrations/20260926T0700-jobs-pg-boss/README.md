# Scheduled jobs run on pg-boss through the jobs service

## What & why

`BackendJob` is now `{ name, cron, run }`: a pg-boss cron schedule (UTC) on a singleton queue,
run by the new `jobs` service (`MODE=jobs`, `devPorts.jobs`, `jobs/` dev package, `coHosted`
under `singleVM`). `defineBackendModule` also takes `queues: [{ name, handler, ... }]`. The
in-process timers under `RUN_MIGRATIONS_ON_BOOT` are gone, which is why sweeps never ran in
production. The migrate companion installs the store (`installJobsSchema`) and grants
`runtime_role`; the MCP worker no longer starts pg-boss and no longer needs `DATABASE_ADMIN_URL`.
Pool defaults drop to 20 (API), 10 (cdc), 10 (yjs).

## Blast radius

Sync-breaking for apps that declared a job with `start`, or edited `main.api.ts` to start one:
after sync the job does not compile. Every app gains a registry service, so production needs one
operator **Apply infra change** before the next deploy (new IAM principal under split-VM, host
scope under `singleVM`). No `clientCacheVersion` bump; the database gains the `pgboss` schema on
the next migrate.

## Run

No script: manual.

## Manual steps

1. Per job: replace `{ name, start: () => scheduleX() }` with `{ name, cron: '<five fields, UTC>', run: () => x() }` and delete the interval scheduler; a throw fails the run and the next period retries.
2. Add `jobs: { enabled: true }` to `services` and `jobs: 4005` to `devPorts` in `shared/config/config.default.ts` if your config is pinned; add `jobs` to `pnpm-workspace.yaml` `packages` if that file is app-owned.
3. `pnpm generate` (the combined side-effect migration gains the `jobs_grants` block), then `pnpm --filter infra compose:generate`.
4. Operator: `pnpm infra` → Apply infra change, then deploy; `/health` reports a `jobs` component.

## Verify

```sh
pnpm --filter backend exec vitest run src/lib/jobs.test.ts   # declarations valid
pnpm dev                                                      # the jobs package logs "scheduling ..."
pnpm jobs                                                     # queues, schedules, failures
pnpm --filter infra test
pnpm check
```
