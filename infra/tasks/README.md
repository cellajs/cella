# infra/tasks

| Task | Purpose | Invocation |
| --- | --- | --- |
| [cutover.ts](./cutover.ts) | `sequenceCutover` re-points traffic to a new VM generation. Side effects (health probe, LB server-list writes) are functions on the plan, so the sequencer is pure and unit tests assert step order. | In-process from the waved rollout in [deploy-run.ts](./deploy-run.ts), between the `pulumi up` create/destroy bookends, never shelled out. |
| [geoip-refresh.ts](./geoip-refresh.ts) | `sequenceGeoipRefresh` downloads the DB-IP Lite databases, verifies each is a real MMDB archive and publishes them plus a `manifest.json` to the `geoip/` prefix of the public bucket, where API processes fetch them at boot and daily. Pure like the reset sequencer; unit tests assert the month fallback, the staleness gate and that nothing uploads on a bad archive. | The deploy's "Ensure GeoIP data" step (35-day gate, best-effort). |
| [reset-database.ts](./reset-database.ts) | `sequenceDatabaseReset` deletes and recreates the app's logical database over the Scaleway RDB API, then re-grants both roles. Pure like the cutover sequencer; unit tests assert step order and every guard. | "Reset database" in `pnpm infra` (or `pnpm infra db-reset`); live effects in [cli/actions/reset-database.ts](../cli/actions/reset-database.ts). |

## Failing a task

A task that [deploy-run.ts](./deploy-run.ts) runs in-process reports failure by throwing, never through `process.exit` or `process.exitCode`: the deploy stops only on a throw. A task whose exit code means something to a standalone caller (the preflight exits 2 for a pending privileged change) throws `ExitCodeError` ([lib/utils/errors.ts](../lib/utils/errors.ts)), and `runIfMain` exits with its code.

## Cutover strategies

`ReplacementStrategy` is declared per service in [config/services.config.ts](../config/services.config.ts); behavior per strategy: [rollout strategies](../../cella/DEPLOYMENT.md#rollout-strategies).

Rules:

- An unhealthy new generation aborts before any LB mutation.
- With `healthAfterExpand` the order is expand, health-gate, contract, for probing health through the public LB rather than a direct new-generation address; the waved rollout always sets it ([rollout.ts](./rollout.ts) `activateService`).
- A stop-first service (`cdc`) gets no LB call and no health poll from `activateService`: the provisioning stack update replaces the generation and the rollout promotes it; the handoff surfaces in the smoke step's aggregate `/health?depth=full` on the primary service ([smoke.ts](./smoke.ts)).
- Smoke results are `ok`, `warn` or `fail`. A `warn` is a line in the run's log; only `fail` exits non-zero. The component check retries across the worker reconnect budget, then judges what is left with [lib/health-components.ts](../lib/health-components.ts): only-degraded warns, anything unhealthy fails (a CDC worker stuck at one change, or kept from reading by its setup check, is unhealthy). `infra status` (`live.components`) reads the same body with the same rule.
- Under `singleVM`, `isSingletonHost` in [lib/services.ts](../lib/services.ts) flags a host running a stop-first worker in-process; [rollout-plans.ts](./rollout-plans.ts) marks that plan `singletonHost`. It overlaps like any start-first service, and [rollout.ts](./rollout.ts) reaps its displaced generation right after promotion (the wave-2 update does when there is one), so the worker's replication slot and cron claim move without waiting for the deploy's last step.
- With `healthAfterExpand`, a health-gate failure after expansion sets the pool back to `[old]` and leaves the follower pools on the old generation. With no old generation the pool stays `[new]` and the followers move to it, so every pool names a VM that exists.
- `sync-rollout-config` drops an `active` pointer whose VM the stack no longer has, so the next cutover runs as a first deploy and never recreates the old release's VM.
- The deploy runs it with `--reset-pending` right after taking the stack lock, before the preflight plans anything. A `pendingSha` found there was left by a deploy that failed before promotion, so it is dropped, and a service whose `active` pointer was dropped adopts its live VM as the overlap partner. Without this, a failed deploy's pending release makes every later preview plan a new generation without minted keys, and the preflight fails.
- The deploy also passes `--deployed`, the services of its rollout rows (the ones with a VM of their own), and every other service's rollout entry is dropped. Under `singleVM` that is every service on the host VM; a disabled service goes the same way. Their pointers stop moving once the host runs them, and turning `singleVM` off would plan each leftover `active` as a preexisting generation with empty boot keys. A dropped service that gets a VM again has no pointer, like a newly enabled one.
- The preflight's preview sets `INFRA_PLAN_LIVE_ONLY`, and the program then ignores every `pendingSha` and plans the `active` generations only. No privileged resource depends on a generation, so the preflight reports the same privileged changes whatever the pointers hold.
- Live Scaleway effects (`createLbSetServers`, `createLbGetServers`) call the zoned Load Balancer API v1 (`PUT`/`GET /lb/v1/zones/{zone}/backends/{backendId}/servers`) in a real deploy only; unit tests inject fakes.

## Database reset rules

- Order pinned by tests: confirmation and backup-ready precede the delete; steps after the delete rethrow as `ResetIrrecoverableError` (behavior: [Reset the database](../../cella/DEPLOYMENT.md#reset-the-database)).
- Tests assert each URL and method of `lib/scaleway/scaleway-rdb.ts` (captured live with `scw --debug`).
- Printed by `rebuildSteps()`: a reboot of the backend machine rebuilds the database, as `infra-boot.service` runs the boot, the migrate companion included, on every boot. The machines have no login, so no step is typed on them.
