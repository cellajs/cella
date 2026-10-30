---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: rotate-passphrase, BOOT_KEY_CONDITION, HANDOFF_FOLDER, handoffServicePath, handoffBundleKey, stageGenerationKeys, withoutKeyFiles, serviceKeyHandoffs, BOOT_PROJECT_PERMISSION_SETS, DEPLOY_SECRET_WRITE_SETS, bootApplicationId, operatorSecretKey
---

# Machines get their service keys in cloud-init; the boot key, the hand-over bundles and Rotate passphrase are gone

Each machine's cloud-init carries its own service keys, which pull the images and write its boot account; the boot identity, the
`/handoff/` bundles, the scrub of user data and **Rotate passphrase** are gone, the observer reads `control/` only and leaves **Rotate
keys**. Each environment owes one sitting once its target carries this change: **Update identities**, an apply, the deploy it starts.

## What & why

Whoever chooses the code that runs with an environment's secrets reads them, so walls inside that deploy path stopped nobody. The deploy
reads each running service's standing key (`tasks/generation-keys.ts`) into the cloud-init of the machines it makes; service policies gain
`ContainerRegistryReadOnly` and `ObjectStorageObjectsWrite`, and the diagnostics bucket admits the service keys and the builder to write their
reports. The observer reads the state bucket's `control/` only, so only the deploy key and the operator read a checkpoint.

## Blast radius

Every app with a deployed stack, for operations only. No database, cache or wire change. Until its sitting an environment's deploys end
blocked before they make a machine, and its machines keep serving. App code or scripts that use a name in `grep` stop compiling or
find no action.

## Run

No script: manual.

## Manual steps

1. Per environment, wait until its target carries this change: staging once the upgrade is merged, production once a release carries it. Its first deploy then ends blocked and the running release keeps serving. A sitting before that would leave an older release's deploy without the boot key it reads.
2. `pnpm infra identity --mode <env>` with an Owner API key that expires within a day: each service policy gains image pulls and boot accounts, the deploy key's policy loses its writes to `/handoff/`, and `<slug>-<env>-boot` is deleted with its key, its standing key and every bundle under `/handoff/`. Revoke the Owner API key after. From here until step 4 ends, a machine of the old release that reboots cannot log in to the registry.
3. `pnpm infra apply --mode <env>` (operator key): it writes the diagnostics bucket's and the state bucket's policies, then starts the blocked target again.
4. The deploy that starts replaces every machine, each with its own keys. When the apply started none, `pnpm infra start-deploy --mode <env>`.
5. Once per app: a tag ruleset on the repository that lets only the release GitHub App create, move or delete release tags, with no bypass. The releases-only rule is as strong as who may push a tag.
6. Scripts and runbooks that call `pnpm infra rotate-passphrase` drop it; a team member who leaves owes **Set up operator key**, **Rotate keys** and **Rotate secrets** ([Someone leaves](../../deployment/KEYS.md#someone-leaves)).

## Verify

```sh
pnpm infra identity --mode <env>   # The identities of <env> are as declared.
pnpm infra runs --mode <env>       # the last run deployed, every machine's boot account present
pnpm infra status --mode <env>     # inventory.applications lists no <slug>-<env>-boot
pnpm check
```
