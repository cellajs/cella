# infra/tasks

## Cutover (`cutover.ts`)

`sequenceCutover` re-points traffic to a newly provisioned VM generation. Every
side effect (health probe, LB server-list writes) is passed in as a function
on the plan, so the sequencer itself is pure and the unit tests assert exact
step order without touching the network.

Two strategies:

- **lb-overlap**: health-gate the new generation, expand the LB backend to
  `[old, new]`, contract to `[new]`, then drain. With `healthAfterExpand`, the
  order is expand → health-gate → contract instead, for services where CI must
  probe health through the public LB rather than a direct new-generation
  address.
- **exclusive**: health-gate only, no LB. Used by `cdc`, which holds a single
  Postgres replication slot that permits exactly one consumer, so the old
  generation must release the slot before the new one acquires it. The new
  generation only reports `/health` healthy once it holds the slot, so
  "destroy old, then poll new healthy" confirms the handoff; that ordering is
  orchestrated by `deploy-service.ts` around its `pulumi up` bookends, after
  `sequenceCutover` returns.

An unhealthy new generation aborts before any LB mutation. With
`healthAfterExpand`, a health-gate failure after expansion leaves the LB in
the overlap state for manual diagnosis rather than rolling back automatically.

The live Scaleway effects (`createLbSetServers`, `createLbGetServers`) call
the zoned Load Balancer API v1 (`PUT`/`GET
/lb/v1/zones/{zone}/backends/{backendId}/servers`); they run only in a real
deploy, unit tests inject fakes instead.

The CLI entry point (the `isMain` guard at the bottom of `cutover.ts`) wires
these effects and is invoked by `.github/workflows/deploy.yml`, which wraps it
with the `pulumi up` create/destroy bookends:

```
tsx infra/tasks/cutover.ts --service backend --sha <git-sha> \
  --strategy lb-overlap --drain-policy requests \
  --lb-zone fr-par-1 --backend-id <uuid> \
  --health-url https://api.example/health \
  --old-ips 10.0.0.4 --new-ips 10.0.0.9 --drain-seconds 10
```

`SCW_SECRET_KEY` must be set in the environment for the live LB call.
