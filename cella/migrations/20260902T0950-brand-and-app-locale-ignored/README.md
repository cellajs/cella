# Brand assets and the app locale namespace are ignored, not pinned

## What & why

`favicon.ico`, `favicon.svg`, `thumbnail.png`, `logo.tsx`, `legal-config.ts`, `locales/en/app.json`
and `locales/nl/app.json` move from `pinned` to `ignored` in the template `cella/cella.config.ts`
(never synced, fork-owned): a pin still merges and silently drops upstream hunks on conflict.
Cella's four onboarding keys move from
`app.json` to `common.json`; `app.json` ships empty. `about.json` stays pinned.

## Blast radius

Not sync-breaking; fork files under the new `ignored` entries are left as they are. An app that
overrode the onboarding copy in its own `app.json` keeps winning (app merges over common); one that
never did shows cella's `common.json` copy, as before.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, take upstream's `ignored` and `pinned` lists: remove `favicon.ico`,
   `favicon.svg`, `thumbnail.png`, `logo.tsx`, `legal-config.ts`, `locales/en/app.json` and
   `locales/nl/app.json` from `pinned` (now in the synced `ignored` block); keep the files.
2. Delete stale `ignored` entries `cella analyze` warns about ("ignored entry not found").
3. Pinned files differing from upstream only by a comment (`cella analyze` lists them as protected
   with a tiny diff): take upstream.

## Verify

```sh
pnpm cella analyze   # "protected in fork" shrinks by the brand and locale entries; no "ignored entry not found"
pnpm check
```
