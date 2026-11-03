---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: RELEASE_CHECK, MAIN_JOB_SCRIPT, RELEASES_ONLY, declaredMainJob, StoreProvisioner, applied.json
---

# The main job runs the applied engine

Per environment, once operator checkouts carry this change: one `pnpm infra apply --mode <env>` on a machine with Docker and buildx. The apply builds the engine image from the checkout, pushes it to the environment's registry, points the main job at it by digest and records `control/<mode>/applied.json`. From then on a release whose `infra/config/`, engine fields of the app config, or root `package.json` Node, pnpm or repository differ from the applied ones ends `apply needed` until an apply from it. An app with a store factory of its own sets `settings` on it.

## What & why

A run of the main job starts from the engine image an apply built (`infra/Dockerfile`, `tasks/publish-engine.ts`): it fetches and installs nothing, and `MAIN_JOB_SCRIPT` hands the image's `main-job` task five env names only. The release check runs in `tasks/main-job.ts` and reads its rule from the image's stamp, which no start value changes. The builder reports the target's description hash (`tasks/description-hash.ts`) in the release manifest, and the deploy holds it against the image's before composing env.

## Blast radius

Every app with a deployed environment: one apply each, on Docker with buildx. No database, cache or lens change. A run started between the upgrade and the apply builds its release and ends apply needed; the apply starts it again. A release older than this change cannot be deployed afterwards.

## Run

No script: manual.

## Manual steps

1. Upgrade every operator checkout, and install Docker with buildx able to build linux/amd64 (Docker Desktop and OrbStack are; a Linux machine on another architecture adds QEMU's binfmt).
2. Let the environment's target move to a commit with this change (staging: the merge; production: the release tag). Its first run, on the definition from before, builds the release and ends **apply needed** ("did not start from the engine image an apply publishes"); the running release stays.
3. `pnpm infra apply --mode <env>` from a checkout at that target. It builds and pushes the engine image, the plan shows the main job's new image, script and env (`MODE`, `REPO`, `REGION`, `RUNTIME_FOLDER` and `RELEASES_ONLY` go), the `up` rewrites the definition, `applied.json` is recorded, and the target starts again from the image.
4. Before the target deployed from the image, **Rotate keys** and **Rotate secrets** redeploy a live commit older than this change, which the engine image cannot deploy: deploy the target first.
5. A store factory of the app's own (a `StoreProvisioner` in `infra/resources/stores/`) sets `settings: config` on what it returns, so a change to its config owes an apply; without it only its kind and the runtime secrets it declares are in the description.
6. An app script that called `declaredMainJob` passes `{ projectId, organizationId, image }` with an image by digest; one that relied on `RELEASE_CHECK` uses `isReleaseCommit` in `infra/lib/deploy/target.ts`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
pnpm infra status --mode <env>
pnpm infra runs --mode <env>
```
