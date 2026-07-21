# Counter-key namespace migration (channel_counters)

Renames the per-node summary keys stored in `channel_counters.counts` (JSONB) to a uniform grammar: `<domain>:<metric>:[h:]<type|role>`. The domain is `e` (entity metrics) or `m` (membership metrics); the metric is `f` (frontier), `c` (count), or `li`/`lu` (timestamps); an `h` segment marks a **home-only** (self) summary, and its absence means the **subtree** rollup (rows at or below the node). The two bare singletons `sequence` and `membership` are unchanged.

## Old → new

| Old key | New key | Meaning |
| --- | --- | --- |
| `f:{type}` | `e:f:{type}` | Subtree frontier |
| `fs:{type}` | `e:f:h:{type}` | Home-only frontier |
| `e:{type}` | `e:c:{type}` | Subtree count |
| `es:{type}` | `e:c:h:{type}` | Home-only count |
| `li:{type}` | `e:li:h:{type}` | Last-insert stamp (home-only) |
| `lu:{type}` | `e:lu:h:{type}` | Last-update stamp (home-only) |
| `m:{role}` | `m:c:{role}` | Membership count by role |
| `m:total` / `m:pending` | `m:c:total` / `m:c:pending` | Membership totals |
| `sequence` / `membership` | (unchanged) | Org-row singletons |

## Blast radius: internal only

These keys never cross the wire. The server reprojects them into the client shape (`frontiers` / `counts` / `membership` / `activity`, keyed by entity type) at one point, `backend/src/modules/entities/helpers/parse-counter-counts.ts`. So this is **not** a client-cache change: no `clientCacheVersion` bump and no lens module. It is still a frozen-envelope contract between the CDC worker (writer) and the backend (reader), so both must cut over together.

## Deploy order

1. Deploy the new backend + CDC image (both carry the new key format).
2. Run counter recalculation (`pnpm seed counters` or your recalc runbook) so `channel_counters` is rebuilt from table data under the new keys. Until this runs, frontiers and counts read as near-zero, because the new code only reads the new keys and existing rows still hold the old ones as dead JSONB entries.

The recalculation is the same repair path used elsewhere; it is idempotent and rebuilds `sequence`, the frontier/count families, and the activity stamps.

## Adopting on a fork

Forks that added entity types or read counters directly must update every site that constructs or reads a counter key:

- **Key construction** (CDC): `cdc/src/utils/update-counts.ts`, `cdc/src/utils/apply-unified-deltas.ts`.
- **Prefix logic** (max-merge): `isMaxMergeKey` / `isActivityStampKey` in `update-counts.ts` (now `startsWith('e:f:')`, `startsWith('e:li:')`, `startsWith('e:lu:')`) and the `apply_count_deltas` PL/pgSQL `LIKE` condition in `backend/scripts/migrations/10-counter-functions.migration.ts`. Run `pnpm generate` to re-emit the side-effect migration after editing the function.
- **Reprojection**: the ordered `startsWith` branches in `parse-counter-counts.ts` (check `e:f:h:` before `e:f:`, `e:c:h:` before `e:c:`).
- **Direct reads**: `entities-queries.ts` (JSONB builders + quota key), `recalculate-counters.ts` (all phases).
- Then regenerate the counter function migration and run recalculation as above.
