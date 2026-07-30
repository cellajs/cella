# Rename the boot runner image (cella-boot to infra-boot)

## What & why

The boot runner image (the container every VM runs at first boot) was renamed from the hardcoded
`cella-boot` to `infra-boot`, decoupling it from the app slug. The name now has one source of truth,
`BOOT_IMAGE_NAME` in `infra/lib/scaleway/boot-image.ts`, used by the image build
(`infra/tasks/build-images.ts`), the CI build in `.github/workflows/deploy-pipeline.yml`, and the
cloud-init boot-image resolution in `infra/resources/compute.ts`. An immutable VM generation pins
its boot image by name plus release sha, and a registry manifest digest is only pullable from its
own repository, so a generation built under `cella-boot` would 404 when the deploy resolves
`infra-boot:<its-sha>`. Two mechanisms carry the transition:

- `resolveBootImage` tries `infra-boot` first and, on a 404, each name in `LEGACY_BOOT_IMAGE_NAMES`
  (currently `cella-boot`), threading the resolved name into cloud-init so the ref points at the
  repository the digest lives in.
- A pre-existing generation whose boot image is no longer resolvable at all (for example the
  registry pruned the old tag) degrades to an unpinned tag with a warning instead of failing the
  deploy; its VM already booted and carries `ignoreChanges` on cloud-init, so the reference is never
  reapplied. A newly rolling generation still requires a pinnable image.

## Blast radius

Sync-breaking for every app that syncs `infra/` and `.github/workflows/` (all of them), at deploy
time only. No `clientCacheVersion` bump, no lens, no wire-shape or database change. The boot image
name lives entirely in shared infra, so an app that never customized this area is still affected but
needs no code edits. The transition is automatic: the first post-pull deploy builds and pushes
`infra-boot:<sha>` for the new generation and resolves pre-rename generations via the legacy
fallback (or degrades them). See `cella/DEPLOYMENT.md`, "Updating the boot runner".

## Run

No script — manual. The sync pulls the renamed `infra/` and `.github/workflows/deploy-pipeline.yml`;
there is no app-owned copy of the boot image name to rewrite.

## Manual steps

1. No app code changes. The boot image name is shared infra that the sync already pulled.
2. Deploy staging before production. Watch the rollout for a one-time warning that a pre-existing
   generation resolved under the legacy name or degraded to an unpinned tag; that is expected on the
   first deploy after the rename.
3. Optional cleanup, once no environment still runs a pre-rename generation (one successful deploy
   per environment): remove `'cella-boot'` from `LEGACY_BOOT_IMAGE_NAMES` in
   `infra/lib/scaleway/boot-image.ts`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```

Then one staging deploy: confirm the `build-boot-image` job pushes `infra-boot:<sha>`, the rollout
cuts over healthy, and `curl -sI https://<staging-host>/ | grep -i x-app-version` reports the
deployed sha.
