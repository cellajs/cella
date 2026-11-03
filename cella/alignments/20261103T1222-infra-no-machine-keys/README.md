---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: machine-keys, machine-policies, machine-identities, generation-keys, secret-copies, secretCopies, serviceKeyCondition, principalSecretCondition, principalServices, DEPLOY_FOLDER, vmService, builderApplicationId, serviceApplicationIds, release-image, resolveReleaseImage, registry-digest, assert-secrets-deliverable, copy-shared-secrets, syncDeployTelemetryKey, INFRA_GENERATION_KEYS_FILE, runtimeSecretManifest, releaseCommand
---

# No key on a machine

Run **Update identities** (`pnpm infra identity`) with an Owner API key, then an apply and a deploy, back to back in each environment: the deploy key's policy then reads secret values in `/runtime/` only, an `<slug>-<mode>-uploads` application signs the backend's uploads, and the machine and builder identities with their keys are deleted. App code that imported `machine-keys`, `machine-policies`, `secret-copies`, `release-image` or `generation-keys` fails typecheck.

## What & why

Machines and the builder held standing keys in their user data. Now the builder writes each image as an archive with a manifest of digests under `releases/<sha>/` of the boot-diag bucket, through links the deploy signs; the deploy composes each machine's env file from one container per value in `/runtime/`; a machine fetches it and its archives through links that end within minutes, refuses an archive whose digest differs, and loses the links once it booted.

## Blast radius

Every app with a deployed environment: one Owner moment per environment, then an apply and a deploy. No database, cache or lens change. Between the Owner moment and the deploy, the backend's uploads fail and a machine that reboots does not come up.

## Run

No script: manual.

## Manual steps

1. Upgrade every operator machine first: an older checkout reads secrets in the folders this change empties.
2. `pnpm infra identity --mode <env>` with an Owner API key that expires within hours: it rewrites `<slug>-<mode>-ci-deploy-policy`, makes `<slug>-<mode>-uploads` with its policy and writes its key to `/runtime/uploads-access-key` and `/runtime/uploads-secret-key`, and deletes `<slug>-<mode>-vm-<service>`, `<slug>-<mode>-builder` and `<slug>-<mode>-boot` with their keys, the `/deploy/machine-key-*` secrets and `/handoff/`.
3. At once, `pnpm infra apply --mode <env>` on the operator key: before its `up` it moves each runtime secret's copies into one container in `/runtime/`, keeping the first consumer's copy and any value only another copy held, and the repository read key out of `/deploy/`; the `up` adopts those containers and gives the main job `RUNTIME_FOLDER`.
4. `pnpm infra start-deploy --mode <env>` when the apply started no deploy: the first deploy builds the release again, as archives, and replaces every machine.
5. The registry namespace's images are read by nothing any more: delete them in the console (Container Registry → the namespace) to stop their storage.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
pnpm infra status --mode <env>
pnpm infra runs --mode <env>
```
