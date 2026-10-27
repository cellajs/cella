---
syncBreaking: true
clientCacheBump: false
caughtBy: tests
---

# The style check reads strings, JSON and .env comments for em dashes

`pnpm style` now refuses an em dash in string literals of source files, in JSON values and in `.env*` comments, as
AGENTS.md has always asked ("anywhere in text"), and a comment reached through a token boundary fails like any other.
App-owned text that holds one fails `pnpm check` after the sync: rewrite it.

## What & why

The rule read comments and Markdown only, so em dashes in strings, JSON and `.env.example` passed. Synced files arrive
fixed; app-owned JSON and source with an em dash fail until rewritten. Known: projectcampus `locales/en/about.json` and
the pinned `json/text-blocks.json`.

## Blast radius

App-owned strings, JSON (translations included) and `.env*` comments with an em dash. An app with none has nothing to
do. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm style` and rewrite each em dash it names: split the sentence, use a colon, or drop the clause.

## Verify

```sh
pnpm style
pnpm check
```
