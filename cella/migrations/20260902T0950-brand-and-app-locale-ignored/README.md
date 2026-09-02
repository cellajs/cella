# Brand assets and the app locale namespace are ignored, not pinned

## What & why

The template's `cella/cella.config.ts` pinned brand files (favicons, logo) and `locales/en/app.json`,
and forks added `thumbnail.png`, `legal-config.ts` and `locales/nl/app.json` to their own pins. A
pin still merges and drops every upstream hunk on conflict, silently; and cella has no upstream fix
to push into a fork's brand or copy (cella's `app.json` held 4 keys against 100+ per fork). They
move to `ignored`: never synced, fork-owned outright. The four onboarding keys cella's own
components read from `app.json` moved to `common.json`, where template-consumed copy belongs;
`app.json` ships empty. `about.json` stays pinned: forks reuse most of cella's marketing copy.

## Blast radius

Not sync-breaking. Fork files under the new `ignored` entries are left exactly as they are. An app
that overrode the onboarding copy in its own `app.json` keeps winning (app merges over common).
An app that never overrode it now shows cella's copy from `common.json`, as before.

## Run

No script — manual.

## Manual steps

1. In `cella/cella.config.ts`, take upstream's `ignored` and `pinned` lists for the entries above:
   remove `favicon.ico`, `favicon.svg`, `thumbnail.png`, `logo.tsx`, `legal-config.ts`,
   `locales/en/app.json` and `locales/nl/app.json` from `pinned`, keep them (they are now in the
   synced `ignored` block).
2. Delete stale `ignored` entries `cella analyze` warns about ("ignored entry not found").
3. Pinned files whose only difference from upstream is a comment (`cella analyze` lists them as
   protected with a tiny diff): take upstream, so the pin stops hiding real upstream edits later.

## Verify

```sh
pnpm cella analyze
pnpm check
```

The "protected in fork" list should shrink by the brand and locale entries and show no
"ignored entry not found" warnings.
