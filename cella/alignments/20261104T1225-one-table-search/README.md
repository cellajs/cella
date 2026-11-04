---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: TableSearch, searchInRow, searchLabel, PopupSearchChips, SearchDialogBar, onClear, isWrapped, TableCount, edgeless, --sticky-stack-nav, useStackedPin, data-search-chip, data-flight-fade, !isFiltered
---

# Every table bar searches with chips; from `lg` up nothing in it hides

`TableSearch` is gone: a bar renders `TableBarSearch` (`~/modules/common/data-table/table-bar-search`) with its
`isFiltered`, and a lone list search renders `SearchField`. `TableFilterBar` drops `searchInRow` and `searchLabel` and
takes `foundCount` always. `SearchChipsField` takes `resultCount={{ count, resource }}` in place of its `count` string,
`edgeless` as a prop, and renders its options inside the field (`InlineSearchChips`). `SearchDialogBar` takes `hasSearch`
and `onClear`. raak: `task/board-search.tsx`; projectcampus: `milestone/table/submissions-bar.tsx`, `item/feed/home-feed.tsx`,
`item/feed/aggregated-item-feed.tsx`.

## What & why

A table bar's search hid its count on focus and its action while searching. From `lg` up the action and the count stay,
the count reading "3 members found" while a search filters. Below `lg` the field takes the row in use, and a filtered row shows "3 members found · Clear
all" below it. A phone's filtered row pins under the page tabs and publishes `--sticky-stack-pin`. Search dialogs share
one X that clears, then closes. Text comes from `countText` (`search-chips/count-text`).

## Blast radius

Imports of `TableSearch` or `PopupSearchChips` and the old props fail to compile. A bar's own `!isFiltered &&` action
gate, `TableCount` props and `--sticky-stack-nav` offsets compile and act differently. Bars on `TableBarShell` change
without app work. No database or lens change.

## Run

No script: manual.

## Manual steps

1. A `TableSearch` in a `TableFilterBar` becomes `<TableBarSearch groups={[]} chips={[]} isFiltered name label value onSearch onReset={onResetFilters} />`, with `allowOfflineSearch` for a list filtered in the client; drop `searchLabel`.
2. Pass `foundCount` to `TableFilterBar`: `countText(t, { count, resource }, { found: true })`, empty while nothing filters.
3. A lone `TableSearch` outside a bar, such as projectcampus' feeds, becomes `SearchField` with `className="edgeless"` and the `disabled`/`isSearching` it needs.
4. raak `task/board-search.tsx`: drop `searchInRow`, the `count` prop with its `TableCount` and `className="edgeless"`; pass the field `edgeless`, `isCountInField` and `resultCount={total === null ? undefined : { count: total, resource: 'c:task' }}`.
5. `TableCount` takes `found` while a search filters; a bar passing `count={isFiltered ? null : total}` passes `count={total} found={isFiltered}`.
6. A bar of the app's own that hides its action while filtered (`!isFiltered &&`) drops that gate, as `TableBarShell` did.
7. `SearchDialogBar` takes `hasSearch` and `onClear`; move `onClear` there from `ComboboxSearchInput`, which no longer takes it.
8. CSS that offsets content by `--sticky-stack-nav`, such as a `scroll-mt` or a sticky `top`, adds `var(--sticky-stack-pin, 0px)`.
9. `SearchOptionsList` lost `isWrapped` and takes `isResultPending`; markup that read `data-search-chip` or `data-flight-fade` reads nothing now.

## Verify

```sh
pnpm check
```

By hand from `lg` up: focus a table bar's search and type; the action, the count and the field's width stay put, and the count reads "3 members found". Below `lg`: the field takes the row in use, and a filtered bar shows "N found · Clear all" under it.
