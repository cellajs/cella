# Move cella sync files into the `cella/` folder

## What & why

The three cella-owned control files move from the repo root into the existing `cella/` folder,
keeping all cella machinery in one place:

- `cella.config.ts` → `cella/cella.config.ts`
- `cella.manifest.json` → `cella/cella.manifest.json`
- `cella.migrations.json` → `cella/cella.migrations.json`

`@cellajs/cli` now discovers each file at its `cella/` path (config loader, `MANIFEST_FILE`, the
managed-file/ignore match), and `cella/migrations/run.ts` reads/writes the applied-set from
`cella/cella.migrations.json`. Nothing else changes: app `localPath` values still resolve against
the repo root, and the config's contents are untouched.

## Blast radius

Sync-breaking, no `clientCacheVersion` bump, no database change. Every app is affected — the CLI
looks only in `cella/` after this change, so an app that has not moved its files will get a "config
file not found" error from `cella` commands until the manual `git mv` below is done. Requires the
`@cellajs/cli` release that adds `cella/`-folder discovery (config loader, `MANIFEST_FILE`, the
managed-file match); upgrade the dependency before running the move. `run.ts` keeps a read-only
fallback to the old root `cella.migrations.json`, so the pending plan stays correct in the window
between pulling this change and running the move.

## Run

No script — manual.

## Manual steps

From the repo root, after `pnpm install` has brought in the `@cellajs/cli` release with `cella/` discovery:

1. `git mv cella.config.ts cella/cella.config.ts`
2. `git mv cella.manifest.json cella/cella.manifest.json` (skip if your app has no manifest yet)
3. `git mv cella.migrations.json cella/cella.migrations.json` (skip if your app has no applied-set yet)

If your app pins any of these paths in `overrides` (unusual — `cella.config.ts` is auto-managed),
update those entries to the new `cella/…` paths as well.

## Verify

```sh
pnpm exec tsx cella/migrations/run.ts status   # applied/pending reads the moved file
pnpm cella                                      # CLI loads cella/cella.config.ts
pnpm check
```
