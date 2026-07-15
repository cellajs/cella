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
- [2026-07-batch-cache-removal](./2026-07-batch-cache-removal/): removes the unused
  batch cache machinery (`batchCache` middleware, `batchReservations`, batch token
  index); fork-breaking on the frontend `DeltaFetchFn` (drops the 4th `options`/`cacheToken`
  param on every `registerEntityQueryKeys` delta-fetch). Manual, no script.
- [2026-07-channel-entity-rename](./2026-07-channel-entity-rename/): renames the
  "channel entity" concept to "channel entity" (`ContextEntityType→ChannelEntityType`,
  builder `.context()→.channel()`, `context_type/context_id→channel_type/channel_id`,
  `context_counters→channel_counters`, …). Allow-list codemod; also needs file renames,
  i18n keys, SDK regen, and a DB rename migration — see the folder README.
