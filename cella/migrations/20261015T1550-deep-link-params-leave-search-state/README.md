---
syncBreaking: true
clientCacheBump: false
---

# Product deep-link params stay out of useSearchParams state

`useSearchParams` now leaves out every search param a product module declares as `deepLinkParam`, as it did for
`attachmentDialogId`. Where the app reads its own product's deep-link param from `useSearchParams().search`, the value
is now `undefined`: read it with `useSearch({ strict: false, select })`, as the sheet and dialog handlers do.

## What & why

The overlay keys in `frontend/src/hooks/use-search-params.tsx` were a fixed list (`userSheetId`, `attachmentDialogId`,
`groupId`). An app's own sheet param, such as `taskSheetId`, was part of every table's search state: opening the sheet
re-rendered each `useSearchParams` consumer, and a table's `setSearch` could write the stale value back and reopen a
closed sheet. The list now reads each product's `deepLinkParam` from `frontend/src/lib/entity-modules.ts`.

## Blast radius

Apps whose products declare `deepLinkParam`. An app that reads the param only through `useSearch`, as the template
does, changes nothing. A sheet or dialog param that is no product's `deepLinkParam` stays in table state. No database or
cache change.

## Run

No script: manual.

## Manual steps

1. List the app's deep-link params: `grep -rn "deepLinkParam:" frontend/src/modules`, then resolve each constant to its string (`TASK_SHEET_PARAM` is `'taskSheetId'`).
2. For each param, find reads in files that call `useSearchParams`: `grep -rln "useSearchParams" frontend/src | xargs grep -n "<param>"`.
3. Replace each read of `search.<param>` from `useSearchParams` with `useSearch({ strict: false, select: (search) => search.<param> })`.
4. Remove the param from any `setSearch({ ... })` call: the sheet or dialog that owns it writes it.

## Verify

```sh
pnpm --filter frontend ts
pnpm exec vitest run --project=frontend frontend/src/hooks
pnpm check
```
