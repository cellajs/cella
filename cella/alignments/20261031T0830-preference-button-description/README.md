---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# PreferenceButton has no description

`PreferenceButton` no longer takes `description`, and its help toggle no longer opens text under the button. An app passing `description` moves that text into the dialog the button opens, or drops it.

## What & why

The help toggle in a `PreferencesGroup` stays for switches. A button already opens a dialog with room to explain itself, so the text under `PreferenceButton` repeated what the dialog says. `TagBadges` also takes a required `kind`: an owner tag renders as a secondary badge.

## Blast radius

Only apps with their own `PreferenceButton` or `TagBadges` call. Typecheck flags each one. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. Remove `description` from each `PreferenceButton`, and drop `help` from its `PreferencesGroup` when nothing else in the group has a description.
2. Pass the tag kind to each `TagBadges`.

## Verify

```sh
pnpm check
```
