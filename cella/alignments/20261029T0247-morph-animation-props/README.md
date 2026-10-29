---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: MorphAnimation
---

# Marketing pages pass new MorphAnimation props

An app that keeps its own `frontend/src/modules/common/morph-animation` module, an ignored path, while it syncs
`frontend/src/modules/marketing` makes its `MorphAnimation` accept the `still` and `fizz` props and the `database`
variant. raak's empty shell adds them to its props interface.

## What & why

The sync engine page freezes its mark with `still` and keeps its grains alive with `fizz`, and the features page draws
the `database` variant, the database icon in the same grains. The synced pages pass these props to whatever
`MorphAnimation` the app's module exports.

## Blast radius

Only an app that replaced the morph animation module is affected: its typecheck fails on the unknown props once the
marketing pages sync. An app on the template module gets them with the upgrade. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In the app's `morph-animation.tsx`, add `still?: number`, `fizz?: number` and the `'database'` variant to the props.

## Verify

```sh
pnpm check
```
