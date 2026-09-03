# Move cella sync files into the `cella/` folder

## What & why

The three cella-owned control files move from the repo root into `cella/`: `cella.config.ts` ->
`cella/cella.config.ts`, `cella.manifest.json` -> `cella/cella.manifest.json`,
`cella.migrations.json` -> `cella/cella.migrations.json`. `@cellajs/cli` discovers each at its
`cella/` path (config loader, `MANIFEST_FILE`, the managed-file/ignore match) and
`cella/migrations/run.ts` reads/writes the applied-set from `cella/cella.migrations.json`. App
`localPath` values still resolve against the repo root; config contents are untouched.

## Blast radius

Sync-breaking for every app; no `clientCacheVersion` bump, no database change. The CLI looks only in
`cella/`, so `cella` commands fail with "config file not found" until the `git mv` below. Requires
the `@cellajs/cli` release with `cella/`-folder discovery. `run.ts` keeps a read-only fallback to
the root `cella.migrations.json`, so the pending plan stays correct in between.

## Run

No script, manual.

## Manual steps

From the repo root, after `pnpm install` brought in the `@cellajs/cli` release with `cella/`
discovery:

1. `git mv cella.config.ts cella/cella.config.ts`
2. `git mv cella.manifest.json cella/cella.manifest.json` (skip if your app has no manifest yet)
3. `git mv cella.migrations.json cella/cella.migrations.json` (skip if your app has no applied-set yet)
4. If your app pins any of these paths in `overrides` (unusual; `cella.config.ts` is auto-managed),
   update them to the new `cella/…` paths.

## Verify

```sh
pnpm exec tsx cella/migrations/run.ts status   # applied/pending reads the moved file
pnpm cella                                      # CLI loads cella/cella.config.ts
pnpm check
```
