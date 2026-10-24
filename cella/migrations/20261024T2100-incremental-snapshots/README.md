---
syncBreaking: true
clientCacheBump: false
roots: backend/drizzle
---

# Migration snapshots are stored as diffs

drizzle-kit moves to `1.0.0-rc.5`, which keeps the first `snapshot.json` in `backend/drizzle` whole and stores each
later one as a diff. `pnpm generate` refuses the app's folder until it is converted: the codemod deletes the snapshot
copies in side-effect folders and runs `drizzle-kit up`. No `migration.sql` changes.

## What & why

Every migration stored a full schema snapshot, so `backend/drizzle` grew by the whole schema per change. In cella
that was 11 MB of snapshots, 25 of them copies that `upsertMigration` wrote into `*_side_effects` folders. Snapshot
format 9 stores one diff per migration. `upsertMigration` now writes no snapshot: `drizzle-kit up` refuses two
snapshots with one id.

## Blast radius

Every app: `backend/drizzle` is app-owned and stays in the old format until converted. Snapshots only: no database
sees a new migration, no cache bump, no lens. On copies of raak and projectcampus the snapshots went from 16.4 MB to
0.75 MB and 5.2 MB to 0.63 MB.

## Run

```sh
pnpm exec tsx cella/migrations/20261024T2100-incremental-snapshots/incremental-snapshots.ts inventory backend/drizzle   # report only
pnpm exec tsx cella/migrations/20261024T2100-incremental-snapshots/incremental-snapshots.ts rewrite   backend/drizzle   # apply
```

## Manual steps

1. An app branch that generated a migration before this sync needs `rewrite` once more after it merges: `pnpm generate` asks with "please run drizzle-kit up".

## Verify

```sh
pnpm generate   # drizzle-kit: No schema changes, nothing to migrate
pnpm check
```
