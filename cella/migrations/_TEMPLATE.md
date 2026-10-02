---
syncBreaking: true
clientCacheBump: false
roots: backend/src, frontend/src
---

<!--
Copy this file to `<YYYYMMDDThhmm>-<slug>/README.md`, fill every section and delete this comment.
The timestamp is UTC, minute precision, from when the breaking change merges (`date -u +%Y%m%dT%H%M`).
Frontmatter: `syncBreaking` and `clientCacheBump` are required; `roots` (the codemod's default scan
roots) only when the folder ships a codemod, which is the one non-test `.ts` file in it.
Keep the title, the summary paragraph and the five headings below in this order: `run.ts`, the
style check and agents rely on the shape.
Word caps: What & why 80, Blast radius 50, Manual steps one line per step, Verify commands only.
Nothing else to register: the folder is the migration.
-->

# <Title>

<One paragraph that `run.ts` prints as the summary: what an app has to change, with the concrete
symbols, files or columns. The sections below carry the detail; do not repeat it there.>

## What & why

<At most 80 words: what changed upstream and the one-sentence reason. Name the concrete symbols,
files, or columns so a reader can grep for them in their app.>

## Blast radius

<At most 50 words: who is affected, whether it is sync-breaking, bumps `clientCacheVersion`, ships a
lens, or touches the database. Say when an app that never customized this area is unaffected.>

## Run

<The codemod invocation, or "No script: manual." Always from the repo root.>

```sh
pnpm exec tsx cella/migrations/<id>/<script>.ts inventory <roots>   # report only
pnpm exec tsx cella/migrations/<id>/<script>.ts rewrite   <roots>   # apply
```

## Manual steps

<Numbered, per-file steps the codemod cannot do: file renames (`git mv`), ambiguous identifiers
it deliberately skips, DB migrations, config keys. `backend/drizzle` is app-owned (the default sync
config ignores it), so a template migration never arrives: say what `pnpm generate` produces and
name the hand-written SQL to port (backfills, data moves), or state that `pnpm generate` alone is
enough. Omit the section only if there are none.>

## Verify

<The exact gates to run, ending in `pnpm check`. List any follow-up like `pnpm generate`,
`pnpm sdk`, or a recalculation runbook.>
