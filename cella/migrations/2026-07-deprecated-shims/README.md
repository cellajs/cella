# Deprecated compat-shim removal

Removes the two remaining `@deprecated` backward-compat shims ahead of the stable release. Upstream cella arrives already migrated; forks that still reference either name fix the call sites after pulling. Manual, no script — the surface is a couple of renames.

## What changed upstream

- **`FilterBarContent` is gone** from `frontend/src/modules/common/data-table/table-filter-bar.tsx`. It was a deprecated alias for `FilterBarFilters`, left over from the filter-bar split into `FilterBarSearch` (search input, fades in over the actions on mobile) and `FilterBarFilters` (other filter controls, slide in from the right).
- **`backend/src/modules/entities/helpers/get-entity-counts.ts` is gone.** It only re-exported `getEntityCounts`, `getEntityCountsSelect`, and `getOrgEntityCount` from `#/modules/entities/entities-queries`.

## What forks must do

1. **Rename `FilterBarContent` usages.** Find them:

   ```sh
   grep -rn "FilterBarContent" frontend/src
   ```

   A mechanical rename to `FilterBarFilters` preserves today's behavior (the alias pointed there). But check each site: if it wraps the table's search input, use `FilterBarSearch` instead — that's what drives the correct mobile fade-in animation.

2. **Repoint entity-count imports.** Find them:

   ```sh
   grep -rn "helpers/get-entity-counts" backend/src
   ```

   Change each import path to `#/modules/entities/entities-queries` (same export names, no other changes).

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
```

`pnpm ts` fails on any site the greps missed (unresolved import / unknown identifier), which is how you know you're done.
