# infra/tasks

| Task | Purpose | Invocation |
| --- | --- | --- |
| [`cutover.ts`](./cutover.ts) | `sequenceCutover` re-points traffic to a new VM generation. Side effects (health probe, LB server-list writes) are functions on the plan, so the sequencer is pure and unit tests assert step order. | In-process from the waved rollout in [deploy-run.ts](./deploy-run.ts), between the `pulumi up` create/destroy bookends, never shelled out; by hand via the `isMain` CLI entry point, below. |
| [`reset-database.ts`](./reset-database.ts) | `sequenceDatabaseReset` deletes and recreates the app's logical database over the Scaleway RDB API, then re-grants both roles. Pure like the cutover sequencer; unit tests assert step order and every guard. | "Reset database" in `pnpm infra`; live effects in [`cli/actions/reset-database.ts`](../cli/actions/reset-database.ts). |

## Cutover strategies

`ReplacementStrategy`, declared per service in [config/services.config.ts](../config/services.config.ts):

- **start-first**: health-gate the new generation, expand the LB backend to `[old, new]`, contract to `[new]`, drain. With `healthAfterExpand` the order is expand → health-gate → contract, when CI must probe health through the public LB, not a direct new-generation address. The waved rollout always sets it ([rollout.ts](./rollout.ts) -> `activateService`).
- **stop-first**: health-gate only, no LB overlap. Declared by `cdc`, whose single Postgres replication slot permits one consumer. The new generation reports `/health` healthy only once it holds the slot, so "destroy old, then poll new healthy" confirms the handoff (ordered by `rollout.ts` -> `activateService`).
- **Derived, not declared**: under `singleVM` a start-first host that folds a stop-first worker is effectively stop-first. [rollout-plans.ts](./rollout-plans.ts) marks that plan `exclusive` (via `effectiveStrategy` in [lib/services.ts](../lib/services.ts)), zeroing `drainSeconds` and emptying `oldIps`: the cutover still health-gates but drives the LB pool straight to `[new]`. The declared strategy stays `start-first`; only the plan changes.

Rules:

- An unhealthy new generation aborts before any LB mutation.
- With `healthAfterExpand`, a health-gate failure after expansion leaves the LB in the overlap state for manual diagnosis; no automatic rollback.
- Live Scaleway effects (`createLbSetServers`, `createLbGetServers`) call the zoned Load Balancer API v1 (`PUT`/`GET /lb/v1/zones/{zone}/backends/{backendId}/servers`) in a real deploy only; unit tests inject fakes.

Operator command (`SCW_SECRET_KEY` must be set for the live LB call):

```
tsx infra/tasks/cutover.ts --service backend --sha <git-sha> \
  --strategy start-first --drain-policy requests \
  --lb-zone fr-par-1 --backend-id <uuid> \
  --health-url https://api.example/health \
  --old-ips 10.0.0.4 --new-ips 10.0.0.9 --drain-seconds 10
```

## Database reset rules

- Order, pinned by tests: the operator's typed `<database>@<instance>` confirmation and a backup reporting `ready` both precede the delete.
- Steps before the delete are guards and fail harmlessly; steps after are recovery-critical and rethrow as `ResetIrrecoverableError`, carrying the backup id and printing the `scw rdb backup restore` command plus the two `privilege set` calls (a restore does not bring privileges back).
- Tests assert each URL and method of `lib/scaleway/scaleway-rdb.ts` (captured live with `scw --debug`).
- Not automated, printed by `serialConsoleSteps()`: no reboot re-runs migrations (`migrate` is `restart: 'no'` in compose, cloud-init is first-boot only, the boot-replay unit only cats a log).
- Scaleway deletes a database in active use, even one holding a logical replication slot (which PostgreSQL itself refuses). The typed confirmation is the only interlock.
