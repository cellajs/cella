# Table filter bars drop the dead sticky wiring

## What & why

`TableBarContainer` (`frontend/src/modules/common/data-table/table-bar-container.tsx`) no longer
wraps the filter row in `StickyBox`. The sticky path was unreachable: `enableSticky` defaulted to
false and no bar ever set it, so `offsetTop`, `enableSticky`, the `focusView` subscription and the
`group/sticky` classes were inert. The container is now a plain flex row plus the search-vars
scroll reset. `EntityGridBar` lost its `isSheet` prop, which only fed that `offsetTop`.

## Blast radius

Not sync-breaking for the shared bars (they arrive migrated). App-owned bars that pass `offsetTop`
to `TableBarContainer`, or `isSheet` to `EntityGridBar`, fail `pnpm check` with an unknown-prop
error until step 1 and 2. `StickyBox` itself is untouched; tab navs, the docs operations page and
any app use of it keep working. No DB or wire change.

## Run

No script: manual.

## Manual steps

1. In every app-owned `*-bar.tsx` remove `offsetTop={...}` (and `enableSticky`) from `<TableBarContainer>`.
2. In every app-owned `*-grid.tsx` remove `isSheet={...}` from `<EntityGridBar>`.
3. Only if an app-owned bar relied on the table bar rendering `data-sticky` or the `group/sticky` name: it never did in practice, but move that styling onto a direct `StickyBox` if it must stay.

## Verify

```sh
grep -rn "TableBarContainer" frontend/src | grep -n "offsetTop\|enableSticky"   # must be empty
grep -rn -A12 "<EntityGridBar" frontend/src | grep "isSheet"                    # must be empty
pnpm check
```
