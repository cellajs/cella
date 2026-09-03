# Hierarchy-owned id-column keys and row-location API

## What & why

`EntityHierarchy` instances own row location: `idColumnKeys` (`organization` to `organizationId`),
`idColumnKey(type)`, `idColumnName(type)`, `resolveNonNullAncestors`, `resolveDeepestAncestorId`,
`possibleHomeChannels`, `computeAncestorPath`, `computeProductPath`, `computeChannelPath`,
`pathColumnSql`, `deepestAncestorSql`. The SQL builders moved from
`backend/src/db/utils/path-column.ts` and `recalculate-counters.ts` to
`shared/src/config-builder/row-path.ts` (`pathColumnSql` / `deepestAncestorSql`); the free
functions stay exported. `config.default.ts` now sets `entityIdColumnKeys: hierarchy.idColumnKeys`
(a literal map drifts).

## Blast radius

Sync-breaking on config only. No wire-shape change, no `clientCacheVersion` bump, no database change
(generated `path` SQL is byte-identical). Apps that never touched the `entityIdColumnKeys` block and
never imported `pathColumnExpression` need only the config edit. Callers of
`pathColumnExpression(entityType, appendOwnId, h, idColumnKeys)` switch to
`h.pathColumnSql(entityType, appendOwnId)` or shared `pathColumnSql(h, ...)` (no injectable
`idColumnKeys`).

## Run

No script, manual.

## Manual steps

1. In `config.default.ts`, replace the literal `entityIdColumnKeys: { ... }` map with
   `entityIdColumnKeys: hierarchy.idColumnKeys,` (import `hierarchy` from your hierarchy config
   module if the file only re-exports it).
2. Replace app imports of `pathColumnExpression` from `backend/src/db/utils/path-column.ts` with
   `hierarchy.pathColumnSql(type, appendOwnId)` or `pathColumnSql` from `shared`.
3. Optional: helpers hand-writing `` `${type}Id` `` or `` `${snake}_id` `` can use
   `entityIdColumnKey(type)` / `entityIdColumnName(type)` from `shared`, or
   `hierarchy.idColumnKey` / `hierarchy.idColumnName`.

## Verify

```sh
pnpm check
pnpm generate   # must produce no new migration
```
