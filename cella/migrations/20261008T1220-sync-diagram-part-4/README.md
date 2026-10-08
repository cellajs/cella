---
syncBreaking: true
clientCacheBump: false
---

# The sync diagram has a fourth part, and its two locale keys are yours to add

Add `sync_diagram.part_4.label` and `sync_diagram.part_4.text` to your `locales/en/about.json`:
`frontend/src/modules/marketing/about/sync-diagram.tsx` reads both as typed keys, and the file is
app-owned, so a sync does not deliver them.

## What & why

The diagram on the sync engine page gains "Part 4": the workers fold into the API server to show
the single-VM deployment. `modeText` in `sync-diagram.tsx` names the two keys as `TKey`.
`locales/en/about.json` sits in the default `pinned` list, so the template's copy of the keys never
reaches an app.

## Blast radius

Every app that still has `sync-diagram.tsx`: `pnpm ts` fails on the two keys until they exist. An app
that removed the diagram is unaffected. No database, schema or cache impact.

## Run

No script: manual.

## Manual steps

1. Add both keys to `locales/en/about.json`, with the template's text or your own; `text` may carry `<strong>` markup, as the other parts do.
2. Optional: `featuresPageItems` and `syncPageItems` in the template's `marketing-config.tsx` changed (two features merged into `openapi_sdk_docs`, two removed, new layer tags). Your copy and its `features.*` keys keep working as they are.

## Verify

```sh
pnpm check
```
