---
syncBreaking: true
clientCacheBump: false
---

# knip reports unused files, and `pnpm deps:unused` becomes `pnpm unused`

The synced lint job now runs `pnpm unused`, which is `knip --dependencies --include files`. A `package.json` never
syncs, so rename the script there by hand or the job fails on a missing script. A file the app keeps that nothing in
it imports belongs under `entry` in its workspace in `knip.jsonc`, beside the entries this change added for
`board-layout.tsx`, `date-tooltip.tsx`, `list-skeleton.tsx`, `clean-url.ts` and the rest.

## What & why

`knip.jsonc` reported only dependencies, so dead files accumulated unseen. It now reports unused files too, and
declares as `entry` what no cella code imports but an app does: the board, `date-tooltip.tsx`, `list-skeleton.tsx`,
`dropdown-select-item.tsx`, `select-combobox/parent.tsx`, `local-tab-nav.tsx`, `faq.tsx`, `clean-url.ts`,
`date-full.ts`, `in-numbers-array.ts`, `stable-array.ts`, plus the migration codemods, `a11y/src/drive.ts` and
`published-column.ts`.

## Blast radius

Sync-breaking through CI only: the lint job calls `pnpm unused`, which the app's own `package.json` has to define.
Each app then accounts for its own unused files. No database change, no lens, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. In `package.json`, replace `"deps:unused": "knip --dependencies"` with `"unused": "knip --dependencies --include files"`.
2. Run `pnpm unused`; add each file the app keeps on purpose to `entry` in its workspace in `knip.jsonc`, and delete the rest.
3. Read `pnpm deps:unused` in notes dated before this one as `pnpm unused`.

## Verify

```sh
pnpm unused
pnpm check
```
