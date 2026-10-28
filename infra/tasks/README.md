# infra/tasks

The deploy's steps and the operator tasks. [deploy-run.ts](./deploy-run.ts) runs the deploy's steps in order; the sequencers below keep their live effects as functions on a plan, so unit tests assert step order and every guard.

| Task | Purpose | Invocation |
| --- | --- | --- |
| [cutover.ts](./cutover.ts) | `sequenceCutover` re-points a service's LB pool to its new generation. | In-process from the waved rollout, between the `pulumi up` create and destroy bookends. |
| [geoip-refresh.ts](./geoip-refresh.ts) | `sequenceGeoipRefresh` publishes the DB-IP Lite databases and a `manifest.json` to the `geoip/` prefix of the public bucket; nothing uploads on a bad archive. | The deploy's "Ensure GeoIP data" step, best-effort. |
| [reset-database.ts](./reset-database.ts) | `sequenceDatabaseReset` deletes and recreates the app's logical database, then re-grants both roles. | **Reset database** (`pnpm infra db-reset`); live effects in [cli/actions/reset-database.ts](../cli/actions/reset-database.ts). |

## Failing a task

A task that [deploy-run.ts](./deploy-run.ts) runs in-process reports failure by throwing, never through `process.exit` or `process.exitCode`: the deploy stops only on a throw. A task whose exit code means something to a standalone caller (exit 2, blocked: the preflight for a pending privileged change, the secrets check for a missing required secret) throws `ExitCodeError` ([lib/utils/errors.ts](../lib/utils/errors.ts)), and `runIfMain` exits with its code.

## Cutover strategies

Each service's strategy is declared in [config/services.config.ts](../config/services.config.ts); behavior per strategy: [rollout strategies](../../cella/DEPLOYMENT.md#rollout-strategies).

- An unhealthy new generation aborts before any LB mutation.
- The waved rollout always sets `healthAfterExpand` ([rollout.ts](./rollout.ts) `activateService`): health is probed through the public LB after the expand. A failed gate sets the pool back to `[old]`; with no old generation the pool stays `[new]`, so every pool names a VM that exists.
- A stop-first service gets no LB call and no health poll: the stack update replaces its generation, and the smoke step's `/health?depth=full` on the primary service shows the handoff ([smoke.ts](./smoke.ts)).
- Smoke results are `ok`, `warn` or `fail`, and only `fail` exits non-zero. The component verdict is [lib/health-components.ts](../lib/health-components.ts), which `infra status` shares.
- Under `singleVM`, `isSingletonHost` ([lib/services.ts](../lib/services.ts)) flags a host running a stop-first worker in-process, and [rollout-plans.ts](./rollout-plans.ts) marks its plan `singletonHost`, so the rollout reaps its displaced generation right after promotion.
- [sync-rollout-config.ts](./sync-rollout-config.ts) reconciles the control object's pointers with the generations the stack runs, right after the deploy takes the stack lock and before the preflight plans; its comments say which pointers it drops and why.

## Database reset rules

- Order pinned by tests: confirmation and backup-ready precede the delete; steps after the delete rethrow as `ResetIrrecoverableError` (behavior: [Reset the database](../../cella/deployment/RUNBOOKS.md#reset-the-database)).
- Tests assert each URL and method of `lib/scaleway/scaleway-rdb.ts` (captured live with `scw --debug`).
