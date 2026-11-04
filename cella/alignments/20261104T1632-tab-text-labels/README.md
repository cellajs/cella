---
breaking: false
clientCacheBump: false
grep: as TKey, i18n.exists, createResourceError
---

# Page tabs and aside rows take text shown as written

A `PageTab` and a `PageAside` row take `{ label: TKey }` or `{ text: string }`, so an app that casts a name into a key
may write `text` and drop the cast: raak `task/board/project-tab-nav.tsx` (`project.name as TKey`), projectcampus
`material/materials-list.tsx` (`material.name as TKey`). `isTKey` in `~/lib/i18n-locales` serves an app's own key
check, such as projectcampus `utils/toast-unshown-errors.ts`. `createResourceError` takes a `ProductEntityType`.

## What & why

A `label` runs through `t()`, so a name passed as one is read as a key: a space-free name with a colon splits at it
(`Q1:Plan` shows `Plan`), a name equal to a key shows its translation, and `{{...}}` in a name interpolates. `text`
shows as written. A registered tool keeps `label: TKey`. `isTKey` narrows a string `i18n.exists` finds to a key, and a
typed `createResourceError` makes `c:<type>` a checked key.

## Blast radius

Not breaking: every app compiles unchanged, `label: x.name as TKey` included, until it moves to `text`. A product type
without its `c:<type>` noun in `app.json` fails to compile in `resource-error.ts`; raak and projectcampus have them
all. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. raak `frontend/src/modules/task/board/project-tab-nav.tsx`: `label: project.name as TKey` becomes `text: project.name`; drop the comment above it and the `TKey` import.
2. projectcampus `frontend/src/modules/material/materials-list.tsx`: `label: material.name as TKey` in `asideTabs` becomes `text: material.name`; drop the comment line on `PageAside` taking keys and, if unused, the `TKey` import.
3. projectcampus `frontend/src/utils/toast-unshown-errors.ts`: `i18n.exists(message) ? t(message as TKey) : message` becomes `isTKey(message) ? t(message) : message`, importing `isTKey` from `~/lib/i18n-locales`.
4. Any other tab or aside row of the app's own whose caption is user data: `text` in place of a cast `label`.

## Verify

```sh
pnpm check
```
