---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: infra/environments, --defer-reap, pnpm --filter infra diag, pnpm infra geoip-refresh, repair-control-store, validate-state-bucket-policy, buildcache-r
---

# The deploy key writes only hand-over bundles, and each environment owes an Update identities and an apply

The deploy key's policy loses its secret writes outside `/handoff/`, the diagnostics bucket keeps versions, and the main job's definition reads the stack's salt beside the passphrase. Each environment runs Update identities and an apply once; until then its deploys end blocked and name what is owed. An environment that follows the releases accepts only `releases` or a release tag in `infra/environments`.

## What & why

The deploy path reads an environment's secrets by design, so the engine now says so and keeps the deploy path from writing them. A deploy whose key policy differs from the declared one stops blocked. Rotations start their own deploy. A build is redone after a rotation, a lost stack lock stops a run, and `diag`, the `geoip-refresh` action, `repair-control-store`, `validate-state-bucket-policy` and the separate `reap` command are gone. Design: `cella/DEPLOYMENT.md`.

## Blast radius

Every app with a deployed stack. Sync-breaking for operations: each environment's next deploy ends blocked until the steps below ran. A production line in `infra/environments` naming a commit or a branch stops the file parsing, and the runner then starts nothing. No database, cache or wire change.

## Run

No script: manual.

## Manual steps

1. In `infra/environments`, change a `production` line that names a commit or `branch:` to `releases` or a release tag.
2. Per environment, at the dedicated address: `pnpm infra identity --mode <env>` (Owner API key), which rewrites the deploy key's policy.
3. Per environment: `pnpm infra apply --mode <env>` (operator key): the diagnostics bucket's versioning, the main job's definition and its salt reference. The apply starts a blocked target again.
4. Once: move `release` in `infra/runner.json` to a commit that carries this change, then `pnpm infra runner-replace` (operator key): the runner then checks targets with the releases-only rule and runs the pinned `node` image. Its new key comes with **Rotate keys**, as the alignment `20261028T1240-infra-decisions` says.
5. Replace `pnpm --filter infra diag` in scripts and runbooks with `pnpm infra runs --machines` or `pnpm infra runs --sha <sha>`.

## Verify

```sh
pnpm infra status --mode production
pnpm infra runs --mode production
pnpm check
```
