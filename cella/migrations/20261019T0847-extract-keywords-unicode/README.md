---
syncBreaking: false
clientCacheBump: false
---

# extractKeywords keeps letters outside ASCII

`extractKeywords` (`backend/src/utils/extract-keywords.ts`) matches words with `\p{L}\p{N}`, so "patiënt" stays one
word. An app that stores its output in a `keywords` column re-derives the rows written before.

## What & why

The word pattern was `[a-z0-9]+`, which split "patiënt" into "pati" and "nt" and dropped "één" entirely, so a server
search for an accented word found nothing. Accent-insensitive search (`textSearchFilter`) only helps when the stored
keywords still carry the letters.

## Blast radius

Apps that call `extractKeywords` or `extractKeywordsFromBlocks` for a stored column. The template itself has no
caller, and keywords from `deriveDocument` keep their text. New writes are correct at once; earlier rows carry
truncated words until re-derived. No schema change.

## Run

No script: manual.

## Manual steps

1. Re-derive stored keywords once per environment: a one-off script under `backend/scripts/` walks the table by id in batches and writes `extractKeywords(...)` back where it differs. Every rewrite is an UPDATE that CDC fans out, so run it in a quiet moment.

## Verify

```sh
pnpm --filter backend exec vitest run src/utils/extract-keywords.test.ts
pnpm check
```
