<!--
Copy this file to `<YYYYMMDDThhmm>-<slug>/README.md` and fill every section.
The timestamp is UTC, minute precision, from when the breaking change merges (`date -u +%Y%m%dT%H%M`).
Keep the five headings below and their order: `run.ts` and agents rely on the shape.
Add a matching entry to `manifest.json` in the same PR.
-->

# <Title>

## What & why

<One paragraph: what pattern changed upstream and why. Name the concrete symbols, files, or
columns involved so a reader can grep for them in their fork.>

## Blast radius

<Who is affected and how badly. State plainly whether this is fork-breaking, whether it bumps
`clientCacheVersion` or ships a lens, and whether it touches the database. If a fork that never
customized this area is unaffected, say so.>

## Run

<The codemod invocation, or "No script — manual." Always from the repo root.>

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
