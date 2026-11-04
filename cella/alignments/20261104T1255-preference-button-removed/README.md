---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: offline_files.tier_usage
---

# PreferenceButton is gone

`PreferenceButton` (`~/modules/navigation/panels/preferences-group`) is removed. An app tool in the `account.preferences` slot that rendered one builds a plain row: icon in the 1.75rem switch column, label, and a ghost `Button` that opens the dialog, as `OfflineFilesPreference` does. The `offline_files.tier_usage` key is gone.

## What & why

The Offline files card in the Preferences panel became a row: "Store all files" with a Change button, then the percent under the icon beside a Base UI `Meter`. The card held a frame, a badge, a meter and byte counts, which made the panel busy. Only Change opens the dialog, and the dialog keeps the byte counts. `offlineFilesTierText` gains `store`.

## Blast radius

Apps whose own tools import `PreferenceButton` fail to compile, and an app override of `offline_files.tier_usage` in `app.json` is unused. Apps without their own preference tools are unaffected. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Replace each `PreferenceButton` with a row like `OfflineFilesPreference` in `frontend/src/modules/attachment/offline-files-preference.tsx`.
2. Drop `offline_files.tier_usage` from `locales/*/app.json`.

## Verify

```sh
pnpm check
```
