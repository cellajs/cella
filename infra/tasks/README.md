# infra/tasks

| Task | Purpose | Invocation |
| --- | --- | --- |
| [`cutover.ts`](./cutover.ts) | `sequenceCutover` re-points traffic to a new VM generation. Side effects (health probe, LB server-list writes) are functions on the plan, so the sequencer is pure and unit tests assert step order. | In-process from the waved rollout in [deploy-run.ts](./deploy-run.ts), between the `pulumi up` create/destroy bookends, never shelled out; by hand via the `isMain` CLI entry point, below. |
| [`reset-database.ts`](./reset-database.ts) | `sequenceDatabaseReset` deletes and recreates the app's logical database over the Scaleway RDB API, then re-grants both roles. Pure like the cutover sequencer; unit tests assert step order and every guard. | "Reset database" in `pnpm infra`; live effects in [`cli/actions/reset-database.ts`](../cli/actions/reset-database.ts). |

## Cutover strategies

`ReplacementStrategy` is declared per service in [config/services.config.ts](../config/services.config.ts); behavior per strategy: [rollout strategies](../../cella/DEPLOYMENT.md#rollout-strategies).

Rules:

- An unhealthy new generation aborts before any LB mutation.
- With `healthAfterExpand` the order is expand, health-gate, contract, for probing health through the public LB rather than a direct new-generation address; the waved rollout always sets it ([rollout.ts](./rollout.ts) `activateService`).
- A stop-first service (`cdc`) gets no LB call and no health poll from `activateService`: the provisioning stack update replaces the generation and the rollout promotes it; the handoff surfaces in the smoke step's aggregate `/health?depth=full` on the primary service ([smoke.ts](./smoke.ts)).
- Smoke results are `ok`, `warn` or `fail`. GitHub has no yellow job, so a `warn` is a green job with a `::warning::` annotation; only `fail` exits non-zero. The component check retries across the worker reconnect budget, then judges what is left with [lib/health-components.ts](../lib/health-components.ts): only-degraded warns, anything unhealthy fails. `infra status` (`live.components`) reads the same body with the same rule.
- Under `singleVM`, `effectiveStrategy` in [lib/services.ts](../lib/services.ts) derives `stop-first` for a host folding a stop-first worker; [rollout-plans.ts](./rollout-plans.ts) marks that plan `exclusive` (`drainSeconds` 0, empty `oldIps`) while the declared strategy stays `start-first`.
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

- Order pinned by tests: confirmation and backup-ready precede the delete; steps after the delete rethrow as `ResetIrrecoverableError` (behavior: [Reset the database](../../cella/DEPLOYMENT.md#reset-the-database)).
- Tests assert each URL and method of `lib/scaleway/scaleway-rdb.ts` (captured live with `scw --debug`).
- Not automated, printed by `serialConsoleSteps()`: no reboot re-runs migrations (`migrate` is `restart: 'no'` in compose, cloud-init is first-boot only, the boot-replay unit only cats a log).
