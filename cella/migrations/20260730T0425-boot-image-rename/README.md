# Rename the boot runner image (cella-boot to infra-boot)

## What & why

The boot runner image (the container every VM runs at first boot) is renamed `cella-boot` ->
`infra-boot`, single-sourced as `BOOT_IMAGE_NAME` in `infra/lib/scaleway/boot-image.ts` (used by
`infra/tasks/build-images.ts`, `.github/workflows/deploy-pipeline.yml`, `infra/resources/compute.ts`).
Generations pin the image by name plus sha and a digest is only pullable from its own repository,
so `resolveBootImage` tries `infra-boot`, then on 404 each of `LEGACY_BOOT_IMAGE_NAMES`
(`cella-boot`), threading the resolved name into cloud-init; a pre-existing generation whose image
is gone degrades to an unpinned tag with a warning (cloud-init has `ignoreChanges`); a newly
rolling generation still needs a pinnable image.

## Blast radius

Sync-breaking for every app (all sync `infra/` and `.github/workflows/`), at deploy time only. No
`clientCacheVersion` bump, no lens, no wire-shape or database change, no app code edits. The first
post-pull deploy pushes `infra-boot:<sha>` and resolves pre-rename generations via the legacy
fallback (or degrades them). See `cella/DEPLOYMENT.md`, "Updating the boot runner".

## Run

No script, manual.

## Manual steps

1. No app code changes.
2. Deploy staging before production; a one-time warning that a pre-existing generation resolved
   under the legacy name or degraded to an unpinned tag is expected on the first deploy.
3. Optional cleanup, once no environment runs a pre-rename generation (one successful deploy per
   environment): remove `'cella-boot'` from `LEGACY_BOOT_IMAGE_NAMES` in
   `infra/lib/scaleway/boot-image.ts`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```

Then one staging deploy: `build-boot-image` pushes `infra-boot:<sha>`, the rollout cuts over
healthy, and `curl -sI https://<staging-host>/ | grep -i x-app-version` reports the deployed sha.
