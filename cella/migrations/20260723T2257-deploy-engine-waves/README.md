# Deploy engine: waved rollout, internal routes, one deploy command

## What & why

Two-wave rollout (`infra/tasks/rollout.ts`): wave 1 provisions and cuts over the primary service
(backend); wave 2 provisions every remaining service's generation in one stack update and cuts
them over concurrently; one final update reaps displaced generations. One command,
`pnpm --filter infra deploy` (`infra/tasks/deploy.ts`), replaces the
`pulumi`/`roll-backend`/`roll-rest`/`publish-frontend`/`smoke-tests` jobs in
`.github/workflows/deploy.yml` with one `deploy` job. Bindings that baked a generation IP
(`@{backend.privateIp}`) use the LB's ACL-guarded internal route: registry `internalRoute: true`
(backend), cdc binding `ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc`.
Sequential per-service `pulumi up` pairs blew the 20-minute job timeout (raak run 30040238120).

## Blast radius

Sync-breaking for every app (all sync `.github/workflows/deploy.yml` and `infra/`). No
`clientCacheVersion` bump, no lens, no database or wire change. App-added `@{<svc>.privateIp}`
bindings keep working in the default monolith topology but must move to `internalRoute` +
`internalHost`/`internalPort` before adopting the micro stack topology.

## Run

No script, manual.

## Manual steps

1. `infra/config/services.config.ts`: add `internalRoute: true` to the primary (backend) service;
   set cdc's binding to
   `API_WS_URL: 'ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc'`; same for any
   app service others dial by `@{...privateIp}`.
2. `pnpm --filter infra compose:generate`.
3. GitHub branch protection (and deployment dashboards): `roll-backend`, `roll-rest`, `smoke-tests`
   no longer exist; require `deploy`.
4. The first deploy replaces the cdc VM (its binding changed its genId) and creates the internal LB
   pool/frontend/ACLs; deploy staging before production.
5. Optional, default off: `INFRA_PULUMI_DRIVER=automation` (Automation API driver),
   `INFRA_STACK_TOPOLOGY=micro` (per-service generation stacks); see `infra/README.md` (Stacks,
   Vocabulary).

## Verify

```sh
pnpm --filter infra compose:check
pnpm --filter infra exec vitest run
pnpm check
```

Then one staging deploy: wave logs show `[rollout] wave 1/2`,
`curl -m 5 http://<lb-public-ip>:1<port>/health` from outside the VPC is denied, cdc reconnects and
CDC events flow end-to-end.
