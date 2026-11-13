---
breaking: false
clientCacheBump: false
grep: verifiedAt, rebuiltAt, verified_at, rebuilt_at
generate: true
---

# The CDC worker's mailbox stamps one answeredAt

`sync_state` drops `verified_at` and `rebuilt_at` for one `answered_at`, which the worker stamps when it answers the
request that waits (`answerBooksRequest`). An app runs `pnpm generate` with this folder's hints and data.

## What & why

Both columns were overwritten "last answered" moments, read only by `awaitBooksAnswer`. One request waits at a time,
so one stamp answers it; the moment of a rebuild already lives in `sync_incidents`. A verify run without a request now
writes nothing to `sync_state`.

## Blast radius

Every app's database: one column added, two dropped. Nothing in app code reads them unless an app script queried
`sync_state` itself. No wire-shape or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` with `hints.json`, which answers that `answered_at` is a new column, and add `data.sql` after its ADD COLUMN, before the two DROP COLUMN statements.
2. Replace an app script's read of `verified_at` or `rebuilt_at` with `answered_at`.

## Verify

```sh
pnpm generate
pnpm check
pnpm sync:verify
```
