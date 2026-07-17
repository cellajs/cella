# Drizzle migration baseline (squashed history)

Upstream squashed `backend/drizzle/` from 28 folders to 2:

- `20260717083828_clammy_power_man/` — the whole schema as one `CREATE TABLE` baseline.
- `20260717083829_side_effects/` — the combined side-effect block (RLS, immutability, partman,
  counter functions, unlogged, CDC), re-emitted by `pnpm generate`.

The old history had accumulated 28 folders across several large rewrites, seven of them stale
per-producer side-effect folders from the layout that predates the combined collector. Replaying
that history was buying nothing: no fork can migrate through it that isn't already past it.

**A squash cannot be "pulled" by a database.** Migration history is state on both sides, and only
the code side arrives in the pull. Read this before running `pnpm migrate` after the pull.

## Does this affect you?

| Your database | Do this |
|---|---|
| Fresh, or a local dev DB you can wipe | [Path A](#path-a--reset) — destroy the volume and rebuild |
| Has data you must keep (production, staging) | [Path B](#path-b--adopt-the-baseline) — adopt the baseline |

## Why it breaks

Drizzle v1 records applied migrations in `"drizzle-backend"."__drizzle_migrations"` and decides
what to run by **folder name**:

```ts
// drizzle-orm/migrator.utils — getMigrationsToRun
const dbNamesSet = new Set(dbMigrations.map((m) => m.name).filter((n) => n !== null))
return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name))
```

`hash` and `created_at` are written to the row but never consulted for this decision — only `name`
is. After the pull your table holds 28 names that no longer exist on disk, and neither of the two
new names. So both new folders are "unapplied", `pnpm migrate` runs the baseline against your
populated database, and the whole migrate transaction rolls back on the first table:

```
DrizzleQueryError: Failed query: CREATE TABLE "activities" (
  cause: error: relation "activities" already exists
```

Nothing is damaged — it is one transaction — but you cannot migrate until the tracking table
agrees with the folders on disk.

## Path A — reset

Destroy the local volume and rebuild from the new baseline. Everything in the database is lost.

```sh
docker compose -f backend/compose.yaml down -v   # drops the volume, roles and all
pnpm docker                                      # recreate the container
pnpm seed                                        # roles → migrate → seed
```

## Path B — adopt the baseline

Tells the tracking table the baseline is already applied — which for your database is true, since
its 28 predecessors built the same schema — then lets the side-effect folder apply normally.

1. **Back up first.** Path B edits migration bookkeeping; a mistake here is recoverable only from
   a backup. On Scaleway RDB, take a snapshot.

2. **Mark the baseline applied**, without running it. Read the folder name off disk rather than
   copying it from this README — a later upstream regenerate changes it:

   ```sh
   BASELINE=$(ls backend/drizzle | grep -v side_effects)
   HASH=$(shasum -a 256 "backend/drizzle/$BASELINE/migration.sql" | cut -d' ' -f1)
   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -c "
     DELETE FROM \"drizzle-backend\".__drizzle_migrations;
     INSERT INTO \"drizzle-backend\".__drizzle_migrations (hash, created_at, name)
     VALUES ('$HASH', 0, '$BASELINE');"
   ```

   The real hash is written for readability only; `created_at` is `0` because neither is read
   back. The `DELETE` is what retires the 28 dead names.

3. **Migrate.** Only `_side_effects` is now unapplied, so only it runs. Side-effect blocks are
   idempotent by contract (`backend/scripts/types.ts`), so re-applying RLS policies, partman
   config, triggers, counter functions and the CDC publication over a live schema is a no-op
   where they already match.

   ```sh
   pnpm migrate
   ```

4. **Verify** — two rows, matching the two folders:

   ```sh
   psql "$DATABASE_ADMIN_URL" -c 'SELECT name FROM "drizzle-backend".__drizzle_migrations ORDER BY id;'
   ```

Path B was tested against a database built from the full 28-folder history and carrying rows in
partman-managed tables (`activities`, `unsubscribe_tokens`): the migrate applied only
`_side_effects` and every row survived.

If your fork has diverged from upstream's schema, the baseline reflects **upstream's** tables. It
is never executed on Path B, so divergence does not break the adopt — but do not treat the
baseline as a description of your database.

## Known divergences from a fresh install

A database migrated through the old history is not byte-identical to one built from the baseline.
Both differences are cosmetic; neither needs action.

- **`channel_counters` primary key.** Existing databases call it `context_counters_pkey`; a fresh
  one calls it `channel_counters_pkey`. `ALTER TABLE ... RENAME` (from
  [2026-07-channel-entity-rename](../2026-07-channel-entity-rename/)) follows OIDs and leaves
  constraint names alone. Nothing reads the name — every `onConflict` in the codebase infers by
  column — so this is inert. To align anyway:

  ```sql
  ALTER TABLE channel_counters RENAME CONSTRAINT context_counters_pkey TO channel_counters_pkey;
  ```

- **Physical column order.** Columns added by `ALTER TABLE` over the old history sit at the end of
  the table; the baseline creates them in schema-declaration order (e.g. `deleted_at`,
  `public_at`, `reminded_at`, `device_id_hash`, `auth_strategies`). Drizzle always names columns
  and the CDC worker resolves pgoutput tuples by name, so nothing depends on ordinal position.

Verified by diffing `pg_dump --schema-only` of both: apart from the pkey name and column order,
the two schemas are identical.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
```
