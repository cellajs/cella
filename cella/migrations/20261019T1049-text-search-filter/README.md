---
syncBreaking: true
clientCacheBump: false
roots: backend/src
---

# Text search filters ignore case and accents

`prepareStringForILikeFilter` (`backend/src/utils/sql.ts`) is removed. Write `textSearchFilter(column, q)`: a
substring match through the new `fold_search` SQL function, so "renee" finds "Renée". The codemod rewrites app
queries; `pnpm generate` adds the function to the app's side-effect migration.

## What & why

Every list search was `ilike(column, '%q%')`: case-insensitive, accent-sensitive, `%` and `_` acting as wildcards.
`textSearchFilter` folds both sides with `fold_search`, the database twin of `foldText` in
`shared/utils/text-match`, and escapes `%` and `_`. Client filters and highlights built on the same matcher agree
with the server about what matched.

## Blast radius

Sync-breaking for apps with their own searches: app-owned files importing `prepareStringForILikeFilter` stop
compiling. Template files arrive rewritten. Adds a database function; no schema change, no cache bump.

## Run

```sh
pnpm exec tsx cella/migrations/20261019T1049-text-search-filter/text-search-filter.ts inventory backend/src   # report only
pnpm exec tsx cella/migrations/20261019T1049-text-search-filter/text-search-filter.ts rewrite   backend/src   # apply
```

## Manual steps

1. Rewrite each use the codemod reports as manual to `textSearchFilter(column, q)`.
2. `pnpm generate`: the app's combined side-effect migration gains the `search_functions` block with `fold_search`; migrate before the new queries run.
3. Optional: a query split into words (`q.split(/\s+/)`) takes `parseTerms(q)` from `shared/utils/text-match` and one `textSearchFilter` per term, so its client filter can use `matchesTerms` on the same terms.

## Verify

```sh
pnpm exec tsx cella/migrations/20261019T1049-text-search-filter/text-search-filter.ts inventory backend/src
pnpm --filter backend generate
pnpm check
```
