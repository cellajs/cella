# Migrations

When an upstream cella change rewrites a pattern across the codebase (a
codemod sweep), upstream code arrives already migrated, but fork-specific
code still uses the old pattern. Each folder here ships the tooling to run
the same sweep on a fork after pulling the change.

## Layout

One folder per migration, named `<yyyy-mm>-<slug>`, containing a `README.md`
with run instructions and whatever the sweep needs (codemod script, data
files). Scripts are run with `pnpm exec tsx` from the repo root and take the
target directory as an argument, so forks can point them at their own code.

## For forks

After pulling an upstream change that references a migration, run it per the
folder's README, then run the repo gates (`pnpm ts`, biome). Migrations are
idempotent where possible: running one against already-migrated code should
be a no-op.

## Migrations

- [2026-07-icon-conventions](./2026-07-icon-conventions/): icons to the
  runtime-only convention with class-based rem sizing (`icon-*` utilities, never
  lucide's px `size` prop), modern `*Icon` names, strokeWidth via
  `LucideProvider`.
- [2026-07-permission-actor](./2026-07-permission-actor/): required `Actor` on every
  permission check, system-admin + public-read parity in collection reads, and public
  read collapsed to a single row-local `publicAt` mode. **Widens access** — audit
  `'own'` cells on channel-entity and `create` rows *before* pulling.
- [2026-07-row-condition-names](./2026-07-row-condition-names/): collapses the row-condition
  model to a `RowConditionName = 'own' | 'public'` union — drops the `RowPredicate`/`RowCondition`
  descriptor, replaces `rowPredicateMatches`/`own`/`publicRow` with `matchesRowCondition(name, …)`,
  and narrows `ActionPermissionState` to the closed name union. **Shape-only, no semantic change**
  and fully compiler-enforced; config surface (`read: 'own'`, `publicRead`) unchanged. In-sync
  forks get it for free; no script.
- [2026-07-batch-cache-removal](./2026-07-batch-cache-removal/): removes the unused
  batch cache machinery (`batchCache` middleware, `batchReservations`, batch token
  index); fork-breaking on the frontend `DeltaFetchFn` (drops the 4th `options`/`cacheToken`
  param on every `registerEntityQueryKeys` delta-fetch). Manual, no script.
- [2026-07-detail-cache-tokenless](./2026-07-detail-cache-tokenless/): drops the single-entity
  cache token — `appCache()` → `appCache(entityType)` on every product detail route, cache
  hits re-authorize via `checkPermission`, and `cacheToken` is removed from the whole
  CDC→SSE→client pipeline (+ `X-Cache-Token` frontend sends). Manual, no script.
- [2026-07-lazy-sync](./2026-07-lazy-sync/): negotiated lazy sync — notifications enqueue
  merged seq ranges (client tiers × server `syncWindow`), unseen badges move to a client
  ledger, catchup folds into the scheduler. Fork steps: `appCache(entityType)` signature,
  verify sub-org viewing detection, mirror feed filters (e.g. `draft`) in `ingestSyncedRows`,
  seen-tracked config invariant. Manual, no script.
- [2026-07-deprecated-shims](./2026-07-deprecated-shims/): removes the last two
  `@deprecated` compat shims — the `FilterBarContent` alias (→ `FilterBarFilters`,
  or `FilterBarSearch` for search inputs) and the `entities/helpers/get-entity-counts`
  re-export file (→ import from `entities/entities-queries`). Manual, no script.
- [2026-07-search-defaults](./2026-07-search-defaults/): list routes declare their default
  view once (`<name>SearchDefaults`) and keep it out of the URL — zod `.default()` rehydrates
  on read, a `stripSearchParams` middleware strips on write. **Fork-breaking**: the
  `defaultValues` option is gone from `useSearchParams` (its mount effect was the inverse of
  the middleware). Read each default off your own generated schema — they differ per endpoint.
  Manual, no script.
- [2026-07-channel-entity-rename](./2026-07-channel-entity-rename/): renames the
  "channel entity" concept to "channel entity" (`ContextEntityType→ChannelEntityType`,
  builder `.context()→.channel()`, `context_type/context_id→channel_type/channel_id`,
  `context_counters→channel_counters`, …). Allow-list codemod; also needs file renames,
  i18n keys, SDK regen, and a DB rename migration — see the folder README.
