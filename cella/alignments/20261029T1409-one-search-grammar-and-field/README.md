---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: textSearchFilter, keywordSearchFilter, parseTerms, TaskSearchScope, useTaskSearchTerms, BoardSearch, FeedSearch, scrollToPinLine
---

# One search grammar, marks in every list, one search field

`shared/utils/parse-search-query.ts` (quoted phrases, `-` exclusions, `=` highlight marker) and `containsWord` are the
template's now; the backend's `searchFilter(columns, q, mode)` and `wordSearchFilter` replace per-word
`textSearchFilter` loops and `keywordSearchFilter`. `TableSearch` takes `label`, `TableFilterBar` takes `searchLabel`,
and `SearchField` (`~/modules/common/search-field`) is the input of every in-page search. Lists mark matches through
`SearchScope` (`~/modules/common/match-highlight/match-scope`). raak: `label/label-queries.ts`,
`task/operations/list-tasks.ts`, `task/task-search-scope.tsx`, `task/board-search.tsx`; projectcampus:
`item/feed/feed-search.tsx`.

## What & why

Lists, the database and the marks over a result now share raak's query grammar: every word must match some searched
column, quotes keep a phrase, `-word` leaves out rows holding that whole word. Tables, grids and app search mark their
matches; a phone shows a hidden matching email or filename under the name. The phone search panel pins at the top over
the page tabs, names what it searches, and leaves the count to the list's first line.

## Blast radius

Lists on `TableBarShell` and the template's list endpoints change on upgrade. App list queries that call
`textSearchFilter(column, q)` keep phrase matching until moved. Apps with their own search field, scope or grammar copy
need work. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. An app copy of `shared/src/utils/parse-search-query.ts` or `containsWord` in `text-match.ts` (raak): take the template's file; the exports keep their names.
2. Backend list queries searching `q`: `searchFilter([table.name, table.email], q)` in place of `or(textSearchFilter(…, q), …)`; it returns undefined without terms.
3. raak `label-queries.ts` and `list-tasks.ts`: `keywordSearchFilter(column, word)` becomes `wordSearchFilter(column, word)`, and the label include loop becomes `searchFilter([labelsTable.name, labelsTable.keywords], q)`; delete `keywordSearchFilter` from `backend/src/utils/sql.ts`.
4. A direct `<TableSearch>` passes `label` ("Search projects": `t('c:placeholder.search_resource', { resource })`); a direct `<TableFilterBar>` passes the same text as `searchLabel`.
5. An app list wraps its table or grid in `<SearchScope q={q}>` and renders searched text through `HighlightText`; a searched column hidden below `md` gets `<MatchReason text={…} shownText={…} />` under the name.
6. raak `task-search-scope.tsx`: `TaskSearchScope` and `useTaskSearchTerms` become `<SearchScope q={q}>` with `q` from the route.
7. raak `board-search.tsx` and projectcampus `feed-search.tsx`: render `SearchField` with `steps` (`useMatchSteps`), the match mode or pills as children; drop the own debounce, clear, Escape and step buttons.
8. Optional, raak: the tasks table drops `=` highlight mode and only filters (`tasks-table.tsx` match query and row tint), then `TasksTableBar` can become a `TableBarShell` call.
9. App code calling `scrollToPinLine` or `useStackedPin`: both now mean the top of the scroll parent, over the sticky stack.

## Verify

```sh
pnpm check
```

By hand at 390 px: the search button reads "Search <list>", the open panel covers the page tabs and pins at the top, a
query marks the matching names, and "hotmail" on members shows the matching email under each name.
