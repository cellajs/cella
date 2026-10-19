---
syncBreaking: true
clientCacheBump: false
---

# The sync config syncs engines and packageManager, and about.json is ignored

Before the sync that brings this note, edit your `cella/cella.config.ts`: add `'engines'` and `'packageManager'` to
`settings.packageJsonSync`, move every `locales/*/about.json` entry from `overrides.pinned` to `overrides.ignored`, and
delete the `frontend/src/modules/marketing/marketing-config.tsx` pin. Commit, then run `pnpm cella sync`.

## What & why

The template's `packageJsonSync` gains `engines` and `packageManager`, so a Node or pnpm bump reaches every package.json
of the app with the sync; the next note pins Node through `engines.node`. The marketing-config pin had no effect: the
marketing module is app-owned (`owner: 'app'`), so the sync skips its folder. `about.json` is the app's own about-page
copy; ignored, it no longer shows as behind upstream.

## Blast radius

Every app. `pnpm cella sync` stops before the merge until `cella/cella.config.ts` follows these changes (or runs with
`--keep-config`). Config only: no code, database or cache change.

## Run

No script: manual.

## Manual steps

1. In `settings.packageJsonSync`, add `'engines'` and `'packageManager'`.
2. In `overrides.pinned`, delete `'frontend/src/modules/marketing/marketing-config.tsx'` and every `'locales/<lang>/about.json'`.
3. In `overrides.ignored`, add `'locales/<lang>/about.json'` for every language the app ships (`en` and `nl` in the template).
4. Commit `cella/cella.config.ts`, then run `pnpm cella sync`.

## Verify

```sh
pnpm cella analyze
pnpm check
```
