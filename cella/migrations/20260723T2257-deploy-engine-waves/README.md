# Deploy engine: waved rollout, internal routes, one deploy command

## What & why

The deploy pipeline was rebuilt around a two-wave rollout: wave 1 provisions and cuts over
the primary service (backend), wave 2 provisions every remaining service's generation in
ONE stack update and cuts them over concurrently, and a single final update reaps all
displaced generations (`infra/tasks/rollout.ts`). Everything after the image builds now
runs as one command, `pnpm --filter infra deploy` (`infra/tasks/deploy.ts`); the
`pulumi`/`roll-backend`/`roll-rest`/`publish-frontend`/`smoke-tests` jobs in
`.github/workflows/deploy.yml` collapsed into one `deploy` job. Service-to-service
bindings that baked a generation IP (`@{backend.privateIp}`) moved to the LB's stable,
ACL-guarded internal route: the registry gained `internalRoute: true` (backend) and cdc's
binding became `ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc`.
Sequential per-service `pulumi up` pairs made a 5-service fork deploy exceed 20 minutes;
raak's release run 30040238120 was cancelled by the job timeout.

## Blast radius

Fork-breaking for every fork that syncs `.github/workflows/deploy.yml` and `infra/` (all
of them). No `clientCacheVersion` bump, no lens, no database change; the wire shape of app
entities is untouched. Forks with extra services (yjs, mcp) benefit most: their services
now deploy concurrently. Forks that added their OWN `@{<svc>.privateIp}` bindings keep
working in the default monolith topology but must move to `internalRoute` +
`internalHost`/`internalPort` before adopting the micro stack topology.

## Run

No script — manual. The sync pulls the new `infra/` and `.github/workflows/deploy.yml`;
fork-owned config needs the steps below.

## Manual steps

1. In `infra/config/services.config.ts`: add `internalRoute: true` to the primary
   (backend) service, and change cdc's binding to
   `API_WS_URL: 'ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc'`.
   Apply the same pattern to any fork-added service that other services dial by
   `@{...privateIp}`.
2. Regenerate the compose artifact: `pnpm --filter infra compose:generate`.
3. In GitHub branch protection (and any deployment dashboards): the required checks
   `roll-backend`, `roll-rest`, and `smoke-tests` no longer exist; require `deploy`.
4. First deploy after pulling replaces the cdc VM (its binding changed its genId) and
   creates the internal LB pool/frontend/ACLs. Deploy staging before production.
5. Optional (leave defaults unless validating deliberately): `INFRA_PULUMI_DRIVER=automation`
   selects the Automation API driver; `INFRA_STACK_TOPOLOGY=micro` splits per-service
   generation stacks. Both default off; see `infra/README.md` (Stacks, Vocabulary).

## Verify

```sh
pnpm --filter infra compose:check
pnpm --filter infra exec vitest run
pnpm check
```

Then one staging deploy: confirm the wave logs (`[rollout] wave 1/2`), that
`curl -m 5 http://<lb-public-ip>:1<port>/health` from outside the VPC is denied, and that
cdc reconnects and CDC events flow end-to-end.
