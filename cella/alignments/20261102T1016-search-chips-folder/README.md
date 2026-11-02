---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The search chips field moves to a folder, and opens as a dialog on a phone

`SearchChipsField` now lives at `~/modules/common/search-chips/search-chips-field`, and its types at `~/modules/common/search-chips/types`. It drops `disabled` and `isSearching`, and `TableFilterBar` takes `wideSearch` only together with `searchInRow` and `foundCount`.

## What & why

On a phone the chips now stay visible while the search is closed, and pressing the field opens a dialog over the list; a pick or the search key closes it. Wider screens keep the popup. Both share their word and chip logic in hooks, so the file became a folder. A filtered list on a phone shows what it found and a way to clear it below its bar.

## Blast radius

Apps importing `SearchChipsField` or its types, passing it `disabled` or `isSearching`, or composing `TableFilterBar` with `wideSearch`. No database or cache change. `onSearch` gets the word being typed as a second argument, which an app can ignore. `TableBarShell` with `searchFilters` gets the phone behavior for free.

## Run

No script: manual.

## Manual steps

1. Update the imports to the two new paths.
2. Remove `disabled` and `isSearching` from any `SearchChipsField`.
3. For a `TableFilterBar` with `wideSearch`, pass `searchInRow` and `foundCount` (what the search finds, as a counted noun), and drop `searchLabel`: the search field names itself.

## Verify

```sh
pnpm check
```
