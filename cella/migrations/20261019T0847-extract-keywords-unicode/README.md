---
syncBreaking: false
clientCacheBump: false
---

# extractKeywords keeps letters outside ASCII

`extractKeywords` (`backend/src/utils/extract-keywords.ts`) now matches words with `\p{L}\p{N}`, so "patiënt" stays
one word. An app that stores its output in a `keywords` column re-derives the rows written before this change.

## What & why

The word pattern was `[a-z0-9]+`, which split "patiënt" into "pati" and "nt" and dropped "één" entirely, so a server
search for an accented word found nothing. The same release adds `fold_search` (side-effect migration) and
`textSearchFilter` (`backend/src/utils/sql.ts`), which compare search terms and columns case- and accent-insensitively;
that only helps when the stored keywords still carry the letters.

## Blast radius

Apps that call `extractKeywords` or `extractKeywordsFromBlocks` for a stored column. The template itself has no caller.
New writes are correct at once; rows written before carry truncated words until re-derived. No schema change.

## Run

No script: manual.

## Manual steps

1. `pnpm generate`: the combined side-effect migration gains the `search_functions` block with `fold_search`.
2. Replace `ilike(column, prepareStringForILikeFilter(q))` with `textSearchFilter(column, q)` in app queries; the old helper is gone.
3. Re-derive stored keywords once, in batches: load each row's description, write `extractKeywords(...)` back. A one-off
   script under `backend/scripts/` that walks the table by id and updates `keywords` is enough; run it after the migration.

## Verify

```sh
pnpm --filter backend exec vitest run src/utils/extract-keywords.test.ts
pnpm check
```
