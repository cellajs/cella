---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: matchMode, parseSearchQuery, resource_count_found, onSearchEnd
---

# Plain search words, and filters as chips in the search field

A search is plain words that must all match. `shared/utils/parse-search-query.ts`, `containsWord`, `MatchMode`, `wordSearchFilter` and the `mode` argument of `searchFilter` and `matchesTerms` are gone, `parseTerms` also splits on commas, and `TableBarShell` takes `searchFilters` where it took `filters`: `SearchChipsField` (`~/modules/common/search-chips-field`) shows them. `SelectRole` gives way to `useRoleSearchFilter`, `useMatchSteps` moved to `~/modules/docs/find-steps`, and `TableFilterBarContext` is gone.

## What & why

Exclusions, the `=` highlight marker, all/any and quoted phrases made the search hard to explain and to keep in step between browser and database. Every word and filter is now its own chip with its own X. `SearchField` loses `steps`: a filtered list shows only matches, so stepping stays with a find in content.

## Blast radius

Breaking for an app that calls the removed helpers, composes `TableFilterBar`, passes `filters` to `TableBarShell`, or uses `SearchField`'s `steps`. Typecheck names each. No lens and no database change. An app using `TableBarShell` without filters only sees the count move into the field.

## Run

No script: manual.

## Manual steps

1. Replace `parseSearchQuery(q).terms` with `parseTerms(q)` and `matchesSearch(fields, parsed)` with `!terms.length || matchesTerms(fields, terms)`. Drop `matchMode` from route schemas, query keys and search params, and run `pnpm sdk`.
2. Replace `filters` on `TableBarShell` with `searchFilters`: `groups` of options and the `chips` of what is on. For a role, call `useRoleSearchFilter`.
3. An app's own field with chips or suggestions becomes `SearchChipsField`, with filters as ordinary URL params and `q` holding words only. Pass `recents` and `onSearchEnd`, stored through `saveRecentListSearch` in `navigationStore`, where people repeat a search.
4. A filtered list drops its match stepping and shows a count. A find that keeps the content around its matches imports `useMatchSteps` and `FindSteps` from `~/modules/docs/find-steps`.
5. A bar that composes `TableFilterBar` drops `filters`, and `TableCount` drops `isFiltered` and `onResetFilters`: the field's X resets. Replace `TableFilterBarContext` with `useBreakpointBelow('sm')`.
6. `ResponsiveSelect` drops `onClear` and `showTitle`. Replace the key `resource_count_found` with `resource_count`.

## Verify

```sh
pnpm check
```
