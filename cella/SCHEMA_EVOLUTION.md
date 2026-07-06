# Schema evolution (lens system)

How breaking schema changes to product entities ship without stranding offline clients. A PWA tab can run last week's bundle with a cache and queued offline edits in last week's shape — the lens system lets old and new bundles coexist against one server during a transition window, and migrates client caches locally without a refetch storm.

Related: [SYNC_ENGINE.md](./SYNC_ENGINE.md) (the sync engine this plugs into) · [ARCHITECTURE.md](./ARCHITECTURE.md). Design history and phase 2 (fork mesh) planning live in the internal working doc.

## TL;DR

A breaking change (e.g. rename `task.name` → `task.title`) ships as an **append-only lens module** declaring the change once. Everything else is derived:

1. **Widened wire schemas** (build time) — during the expand window, ops/create schemas accept both old and new field names
2. **Ops normalization** (server) — old-shape `ops` + `stx.fieldTimestamps` keys are canonicalized inside `resolveUpdateOps`; expand-window twins are mirror-written so old readers stay fresh
3. **Client cache migration** (client boot) — cached rows + queued mutations are rewritten locally in Dexie, no refetch
4. **Multi-tab guard** — a tab running an older bundle stops persisting the moment a newer bundle appears

The global schema version is the lens count. With an empty lens list every seam is a passthrough no-op — which is the current state: **the machinery is fully wired; no lens has shipped yet**.

## Lens module anatomy

```ts
// shared/src/version-changes/2026-07-01-task-name-to-title.ts
// FROZEN once shipped — CI fails on edits. Append-only.
import { defineLens } from './define';

export default defineLens({
  id: '2026-07-01-task-name-to-title',
  entityType: 'task',
  description: 'Rename task.name → task.title',
  phase: 'expand', // 'expand' | 'contract'
  delta: { rename: { from: 'name', to: 'title' } },
});
```

Delta kinds: `rename`, `add` (with a default value **or a pure `(row) => value` function**), `drop`, `retype` (requires `custom` converters), `setRename` (AWSet field rename). `defineLens` stamps a `formatVersion` so the module format itself can evolve. Append the import to `shared/src/version-changes/lens-list.ts` — order is the version history.

**Frozen envelope** (never lensed; changes require an `apiVersion` bump): `stx`/`ops` wire structure, stream notifications, catchup summaries, counter key formats, auth/session contract. Enforced by `lens:check`.

## Where the seams are

| Seam | Location | What it does |
|------|----------|--------------|
| Update schema widening | `backend/src/core/stx/update-schema.ts` (`createUpdateSchema(entityType, shape)`) | Adds old field names as optional aliases while a rename lens is in its expand window |
| Create schema widening | `backend/src/core/stx/lens-seam.ts` (`widenCreateSchema`) | Same for create bodies; a required canonical field relaxes to "alias or canonical present" |
| Server normalization | `resolveUpdateOps(entityType, …)` and `normalizeCreateItem(entityType, item)` | Canonicalizes `ops` + `stx.fieldTimestamps` keys, mirror-writes expand twins, runs `retype` converters — before HLC/AWSet resolution ever sees the data |
| Client boot migration | `frontend/src/query/persister.ts` + `cache-migration.ts` | Persisted `schemaVersion` meta ordinal behind the bundle → chunked Dexie rewrite of cached rows, bundled context queries, and queued mutation variables; pointer advances atomically in the final write; Web Lock prevents concurrent tab passes |
| Multi-tab guard | `frontend/src/query/schema-version-guard.ts` + tab coordinator | Tabs broadcast their schema version; an older-bundle tab marks itself stale and stops persisting. The persister also checks the on-disk pointer on every flush. Pointer ahead of the bundle → restore nothing, never write |
| Telemetry | `X-Client-Version` header → otel counter (`backend/src/middlewares/client-version.ts`); doba hooks (`backend/src/lib/lens-telemetry.ts`) | The version distribution is the **fleet floor** that gates when a contract phase is safe |
| CI guards | `shared/scripts/check-lenses.ts` (in `pnpm check`), `schema-bust-gate` (oasdiff) in CI | Append-only lint, reserved-field collision check, lens purity lint; breaking OpenAPI diffs must carry a `clientCacheVersion` bump or a lens |

The engine facade is `shared/src/version-changes/engine.ts` — the only module importing `dobajs` (pinned; vendorable if the dependency stalls).

## Interim mechanism: cache-bust escape hatch

Until the first lens ships, breaking changes are handled by `appConfig.clientCacheVersion`: bump it in the same PR as the breaking change; on boot the persister wipes cached query data (keeping queued mutations, which replay and quarantine to `failed_sync` on 4xx). The `schema-bust-gate` CI job fails a breaking-diff PR without the bump. Both mechanisms coexist independently; the bust is torn down after lens #1 proves itself in production.

## Shipping a lens: playbook

### Expand PR (one PR, atomic)

1. **Lens module**: `shared/src/version-changes/YYYY-MM-DD-<entity>-<change>.ts` via `defineLens`, `phase: 'expand'`; append to `lens-list.ts`. `pnpm --filter shared lens:check` must pass. Check the field against `productEntityColumns` — renaming a shared base column (`name`, `description`, `keywords`) diverges that entity from the template convention; prefer entity-specific columns.
2. **Drizzle expand migration** (for `rename`): add the new column **nullable** (or with the old column's default) in the entity's `*-db.ts`, run `pnpm generate`, and append a backfill to the generated SQL:
   ```sql
   ALTER TABLE "attachments" ADD COLUMN "title" varchar;
   UPDATE "attachments" SET "title" = "name" WHERE "title" IS NULL;
   ```
   From then on `normalizeOps` mirror-writes keep both columns fresh on every write — no triggers. For `add` deltas, keep the Drizzle column default identical to the lens default.
3. **Canonical switch (backend)**: move ops/create schema shapes to the new field name — widening auto-adds the old name as alias. Responses dual-emit automatically (the row carries both columns). Watch for **hardcoded field reads** in operations (e.g. keyword extraction reading `resolved.values.name`).
4. **Canonical switch (frontend)**: rename usages; old sort keys keep working during the window (both columns exist). Old cached rows are rewritten by the boot migration on first load.
5. **CI expectations**: oasdiff classifies the expand as *additive* — `schema-bust-gate` passes without a `clientCacheVersion` bump.

### Verify before merging

- Engine round-trip unit tests pick the lens up automatically (`shared/src/version-changes/tests/`).
- **Offline e2e runbook** (`pnpm offline`): build the old bundle (main), populate cache + make offline edits; swap to the lens-branch bundle; reconnect. Assert: cached rows show the new field without refetch, queued mutations replay accepted, zero data loss, and a second tab still on the old bundle stops persisting (guard debug log).

### Contract PR (weeks later, separate)

Gated on the `X-Client-Version` fleet floor being past the expand ordinal for `schemaEvolutionPolicy.expandWindowMinDays`.

1. **Contract status lives outside the module** (shipped modules are frozen): add the lens id to a `contractedLenses` list in `shared/src/version-changes/config.ts`; `widenedOpsKeyMap` and mirror-writes skip contracted lenses while cache migrations keep working forever. *This mechanism is small and not yet built — build it with the first real contract PR.*
2. Drizzle migration: `SET NOT NULL` on the new column, `DROP COLUMN` old.
3. Remove remaining old-field mentions from schemas/sort keys.
4. PR title `feat!:` (major release); oasdiff reports breaking — satisfied via the `clientCacheVersion` bump or a future lens-aware gate condition.

### Branch-local rehearsal (no permanent lens)

To rehearse the lifecycle without polluting the append-only lens list: create the lens + expand migration on a throwaway branch, run the offline e2e runbook, verify every assertion, delete the branch. Worth doing once before the first real lens ships under pressure.
