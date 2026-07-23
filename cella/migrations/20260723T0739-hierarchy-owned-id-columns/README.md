# Hierarchy-owned id-column keys and row-location API

## What & why

The `EntityHierarchy` instance now owns row-location behavior. New instance members:
`idColumnKeys` (derived map, `organization` to `organizationId`), `idColumnKey(type)`,
`idColumnName(type)`, `resolveNonNullAncestors`, `resolveDeepestAncestorId`,
`possibleHomeChannels`, `computeAncestorPath`, `computeProductPath`, `computeChannelPath`,
`pathColumnSql`, and `deepestAncestorSql`. The SQL path/home expression builders moved from
`backend/src/db/utils/path-column.ts` and `recalculate-counters.ts` into
`shared/src/config-builder/row-path.ts` as `pathColumnSql` / `deepestAncestorSql`, next to
their JS twins. The free functions (`resolveDeepestAncestorId(h, ...)` etc.) remain exported
and unchanged.

The fork-breaking part: `appConfig.entityIdColumnKeys` is no longer hand-declared. The
template's `config.default.ts` now sets `entityIdColumnKeys: hierarchy.idColumnKeys`. A fork
that keeps its own literal map still compiles, but drifts from the single source the moment
its hierarchy changes.

## Blast radius

Fork-breaking on config, not on call sites. No wire-shape change, no `clientCacheVersion`
bump, no database change (generated `path` column expressions are byte-identical). Forks that
never touched `config.default.ts`'s `entityIdColumnKeys` block and never imported
`pathColumnExpression` from `backend/src/db/utils/path-column.ts` only need the config edit
below. Forks calling `pathColumnExpression(entityType, appendOwnId, h, idColumnKeys)` must
switch to `h.pathColumnSql(entityType, appendOwnId)` or the shared `pathColumnSql(h, ...)`;
the injectable `idColumnKeys` parameter is gone because the naming rule is instance-owned.

## Run

No script — manual.

## Manual steps

1. In your fork's `config.default.ts`, replace the literal `entityIdColumnKeys: { ... }` map
   with `entityIdColumnKeys: hierarchy.idColumnKeys,` (import `hierarchy` from your
   hierarchy config module if the file only re-exports it).
2. If any fork-local code imports `pathColumnExpression` from
   `backend/src/db/utils/path-column.ts`, replace it with `hierarchy.pathColumnSql(type,
   appendOwnId)` or import `pathColumnSql` from `shared`.
3. Optional cleanup: fork-local helpers that hand-write `` `${type}Id` `` or
   `` `${snake}_id` `` can switch to `entityIdColumnKey(type)` / `entityIdColumnName(type)`
   from `shared`, or the `hierarchy.idColumnKey` / `hierarchy.idColumnName` methods.

## Verify

```sh
pnpm check
```

Generated `path` column SQL is unchanged; `pnpm generate` should produce no new migration.
