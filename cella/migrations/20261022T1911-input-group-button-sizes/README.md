---
syncBreaking: true
clientCacheBump: false
---

# InputGroupButton icon sizes are `icon-xs` and `icon-sm` again

`InputGroupButton`'s two icon-only sizes are named `size="icon-xs"` and `size="icon-sm"`, as in the shadcn registry.
An app file of its own that passes `size="size-3"` or `size="size-3.5"` to `InputGroupButton` renames the value.

## What & why

`frontend/src/modules/ui/input-group.tsx` called the two icon-only button sizes `'size-3'` and `'size-3.5'`. An icon
codemod renamed the registry's `'icon-xs'` and `'icon-sm'` keys as if they were classes. The keys emit `size-6` and
`size-8`, so their names misled. They are the registry's names again; the classes are unchanged.

## Blast radius

Sync-breaking only for app-owned files that pass the old values: `pnpm ts` fails on them. Synced files (`combobox.tsx`,
the input-group story) arrive updated. No database, cache or rendering change.

## Run

No script: manual.

## Manual steps

1. In each app-owned file with `<InputGroupButton size="size-3"`, write `size="icon-xs"`; for `size="size-3.5"`, write `size="icon-sm"` (projectcampus: `frontend/src/modules/item/feed/feed-search.tsx`, two buttons).

## Verify

```sh
pnpm --filter frontend ts
pnpm check
```
