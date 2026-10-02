---
syncBreaking: false
clientCacheBump: false
---

# VM IAM principals and policies follow the service registry

Bootstrap-owned IAM (vm-<service> applications, their path-conditioned policies, the singleVM host
condition) derives from the service registry; compute, LB and key minting keep deriving from the
enabled set. Toggling appConfig.services.<slug>.enabled needs no Apply infra change; adding a
registry service or flipping singleVM does, and Apply creates the missing applications itself.
Dormant principals must hold zero API keys: the deploy asserts it and the key mint purges them. One
Apply infra change per bootstrapped stack after syncing (cella: host condition gains /mcp/; raak:
new vm-yjs and vm-mcp principals).

## What & why

`infra/lib/services.ts` gains `placeServices`, `principalServices` and `principalSecretScopeSlugs`; `resources/vm-iam.ts`, the deploy's `vm_assert_json` rows and bootstrap principal creation derive from the full registry, so toggling `appConfig.services.<slug>.enabled` never touches bootstrap-owned IAM. "Apply infra change" creates missing `vm-<service>`/`boot` applications itself. Dormant principals (registry services outside the deployed set) must hold zero API keys: the deploy asserts it and `mint-generation-keys` purges them. Trigger: enabling yjs under `singleVM` stalled the 0.10.2 deploy on a stale host condition (cella #1156).

## Blast radius

Infra only, not sync-breaking, no `clientCacheVersion` bump, no database change. Every bootstrapped stack needs one privileged run. `singleVM` stacks: the host condition gains each non-deployed registry folder (cella: `/<slug>-<mode>/mcp/`). Split-VM stacks: a new application and policy per registry service that was not deployed (raak: `vm-yjs`, `vm-mcp`). Until that run, the next CI deploy fails at `requirePrincipalId` (split-VM) or "Verify VM IAM grants" (`singleVM`).

## Run

No script: manual.

## Manual steps

1. Sync, so `infra/` carries this change.
2. Per stack: `pnpm infra` → Stack setup → **Apply infra change**, with a fresh bootstrap key and `SCW_STATE_ACCESS_KEY` / `SCW_STATE_SECRET_KEY` set to a key of the `<slug>-<mode>-ci-deploy` application. Expect the `pulumi up` diff to show `~rules` on the VM policies, plus new `vm-<service>` policies on split-VM stacks.
3. Revoke the bootstrap key and the temporary CI key.
4. Deploy as usual; "Verify VM IAM grants" reports each dormant principal with no key.

## Verify

```sh
pnpm --filter infra exec tsx tasks/print-deploy-env.ts production
pnpm --filter infra exec vitest run
pnpm check
```
