---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
---

# Attachment size is a byte count: a bigint column and a number on the wire

`attachments.size` is `bigint({ mode: 'number' })`, the create body takes `size` as a non-negative integer, `Attachment.size` in the SDK is a `number` and `formatBytes` takes a number. Before the migration runs, `select size from attachments where size !~ '^[0-9]+$'` on each of the app's databases must return no row. App code that writes or reads `size` as a string follows; in raak that is three test fixtures.

## What & why

Every size is a byte count, yet it was stored as `varchar` and sent as a string: writers called `toString()` or `String()`, readers `Number()`. The column, the create body and the SDK now carry a number, and the six conversions are gone. The attachment create key registers variables version 2, whose upgrade turns the string `size` of a create an older bundle queued offline into a number: the cache bump keeps queued mutations.

## Blast radius

Touches the database (one column type) and the wire (`Attachment.size`, the create body), so it bumps `clientCacheVersion`. Three PRs of one review each bump to a `v31-` name: the last to merge takes the next number. An app that never wrote `size` itself only regenerates and bumps.

## Run

No script: manual.

## Manual steps

1. On every database of the app (development, staging, production), run `select size from attachments where size !~ '^[0-9]+$'`; give each row it returns its byte count, or `0`, before the migration runs: the cast refuses it.
2. Run `pnpm generate`: it alone writes `ALTER TABLE "attachments" ALTER COLUMN "size" SET DATA TYPE bigint USING "size"::bigint;`; no hints, no hand-written SQL.
3. Bump `clientCacheVersion` in the app's own `shared/config/config.default.ts`.
4. Write `size: 1024` for `size: '1024'` where typecheck flags it: raak's `backend/tests/attachment-org-member-reach.test.ts` (the create body and the inserted rows) and `backend/tests/task-attachments-derivation.test.ts` (the inserted rows).
5. Drop a `String()` or `Number()` around an attachment size in app code, and pass `formatBytes` a number.
6. Where the app's `backend/scripts/seeds/seed-assets.json` differs from the template's, write each `size` as a number: typecheck flags the manifest.
7. A create body typed `unknown` (a bench or end-to-end request) sends `size` as a number: the server answers a string with a 400.

## Verify

```sh
pnpm generate
pnpm check
```
