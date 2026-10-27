---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: SimpleHeader, hasCompletedAllSteps
---

# SimpleHeader takes keys, and the stepper reports its completion

`SimpleHeader`'s `heading` and `text` are i18n keys (`TKey`), with `textOptions` for the text's interpolation values:
pass `text="c:home.text" textOptions={{ appName: appConfig.name }}`, not `text={t('c:home.text', ...)}`.
`useStepper()` no longer returns `hasCompletedAllSteps`: pass `onComplete` to `Stepper`, which `nextStep` calls on the
last step.

## What & why

`SimpleHeader` translated whatever it got, so text a caller had translated went through `t()` again, and text that
reads as a key came out changed (`10:30` renders `30`, its `10` taken for a namespace). It takes keys only, as
`ContentPlaceholder` does. A step that watched `hasCompletedAllSteps` in an effect ran once per mounted footer;
`Stepper`'s `onComplete` runs once.

## Blast radius

Apps with their own `SimpleHeader` callers that pass translated text, or code that reads `hasCompletedAllSteps`.
Typecheck flags each one. An app that only has the synced callers gets the change with the sync. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Each `SimpleHeader` that typecheck flags: pass the key as `heading` or `text`, and its `t()` options as `textOptions`.
2. Each reader of `hasCompletedAllSteps`: move what its effect did into `onComplete` on the `Stepper` and delete the effect.

## Verify

```sh
pnpm check
```
