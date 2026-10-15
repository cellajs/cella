---
syncBreaking: true
clientCacheBump: false
---

# Checks report unused exports in *-db.ts files and unregistered backend modules

`pnpm unused` (knip) now reports unused exports in `backend/src/modules/**/*-db.ts`, and the new
`backend/src/modules.test.ts` fails when `backend/src/modules.ts` does not import a `*-module.ts` file. Drop `export`
from, or delete, what knip lists (never from a drizzle schema object), and import every module file in `modules.ts`.

## What & why

knip's drizzle plugin made every `*-db.ts` an entry file, and knip reports no unused export of an entry, so dead
exports there went unseen. `knip.jsonc` now sets `"drizzle": false` in the backend workspace and lists
`drizzle.config.ts` as an entry. A module file registers its routes, jobs and mutation handlers only when `modules.ts`
imports it; a missing import failed nothing.

## Blast radius

Every app: after the sync, CI's lint job (`pnpm unused`) or the backend tests can fail until the steps below are done.
No database change when step 2 is followed; no cache change.

## Run

No script: manual.

## Manual steps

1. If `knip.jsonc` conflicts in the sync, keep `"drizzle": false` and the `"drizzle.config.ts"` entry in the `backend` workspace next to the app's own entries.
2. Run `pnpm unused`. For each export it lists in a `*-db.ts` file: drop `export` when only that file uses it, delete it when nothing does. A drizzle schema object (`pgTable`, `pgEnum`, `pgView`, `relations`) that no code imports keeps its `export`, tagged `/** @public */`: drizzle-kit reads exported objects only.
3. Run `pnpm exec vitest run --project=backend backend/src/modules.test.ts`. For each specifier it lists, add `import '<specifier>';` to `backend/src/modules.ts`.

## Verify

```sh
pnpm unused
pnpm generate   # reports no schema changes
pnpm exec vitest run --project=backend backend/src/modules.test.ts
pnpm check
```
