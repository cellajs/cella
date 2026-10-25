---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: valueSource: 'pulumi', INFRA_NON_INTERACTIVE, INFRA_DEPLOY_NOW, PULUMI_CONFIG_PASSPHRASE, SCW_OWNER_ACCESS_KEY, store-passphrase, deploy-pipeline, github-sync
---

# Deploys run inside the Scaleway organization, and GitHub holds no Scaleway key

A runner machine in the organization starts each deploy as a run of the environment's main job; the GitHub deploy
workflows (`deploy.yml`, `deploy-pipeline.yml`, `geoip-refresh.yml`, `infra-state-prune.yml`) and the GitHub
Environments' Scaleway secrets go. Each environment's operator sets up its identities, operator key and runner once,
by hand, at the dedicated address; `valueSource: 'pulumi'` in an app's `runtime-secrets.config.ts` becomes `'engine'`.

## What & why

Every key now does one kind of work: Owner moments write IAM, an address-locked operator key makes privileged changes, a
deploy key reachable only from the main job deploys, and the runner key only starts runs. The Pulumi state holds no secret
value, and every run leaves a record that `pnpm infra runs` reads. `pnpm infra` has no unattended mode and reads no key
or passphrase from disk. Design: `cella/DEPLOYMENT.md`.

## Blast radius

Every app with a deployed stack, and its operators. Sync-breaking for operations: nothing deploys until the steps below
ran. No database, cache or wire change. An app that edited the removed workflows keeps a trigger that runs nothing.

## Run

No script: manual.

## Manual steps

1. Sync, then rename `valueSource: 'pulumi'` to `'engine'` in app-owned entries of `infra/config/runtime-secrets.config.ts`.
2. Delete `.github/workflows/deploy.yml`, `deploy-pipeline.yml`, `geoip-refresh.yml`, `infra-state-prune.yml` and `.github/actions/pulumi-cli` if the sync left them.
3. Remove `INFRA_NON_INTERACTIVE`, `INFRA_DEPLOY_NOW`, `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` from env files, shell profiles, scripts and keychains.
4. Per app, on the dedicated address: `pnpm infra operator-key` with an Owner API key; store the key it shows.
5. Per environment: `pnpm infra identity --mode <env>` (Owner API key), then `pnpm infra apply --mode <env>` (operator key); the apply moves the secrets out of the state.
6. Per environment: `pnpm infra rotate-keys --mode <env>`, so the deploy key's copy exists for the main job; apply again to make the main job's definition.
7. Per environment: `pnpm infra runner-identity --mode <env>` (Owner API key); commit `infra/Pulumi.<env>.yaml` and the `infra/runner.json` it writes.
8. Once: `pnpm infra runner-replace` (operator key).
9. Delete the `staging` and `production` GitHub Environments and their secrets.
10. Publish a release, or push to a followed branch, and watch `pnpm infra runs`.

## Verify

```sh
pnpm infra status --mode production
pnpm infra runs --mode production
pnpm check
```
