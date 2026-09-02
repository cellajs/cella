<!--
Copy this file to `<YYYYMMDDThhmm>-<slug>/README.md` and fill every section.
The timestamp is UTC, minute precision, from when the breaking change merges (`date -u +%Y%m%dT%H%M`).
Keep the five headings below and their order: `run.ts` and agents rely on the shape.
Word caps: What & why 80, Blast radius 50, Manual steps one line per step, Verify commands only.
`manifest.json` `summary` already carries the one-paragraph version; do not repeat it here.
Add a matching entry to `manifest.json` in the same PR.
-->

# <Title>

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
it deliberately skips, DB migrations, config keys. Omit the section only if there are none.>

## Verify

<The exact gates to run, ending in `pnpm check`. List any follow-up like `pnpm generate`,
`pnpm sdk`, or a recalculation runbook.>
