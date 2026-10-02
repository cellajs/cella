---
syncBreaking: true
clientCacheBump: false
---

# Replace sonner with Base UI Toast

Toasts render through Base UI Toast (frontend/src/modules/ui/toast.tsx, ported from the shadcn base
toast) and the sonner dependency is removed. toaster.<severity>(message, options) keeps its shape
with Base UI options (description, actionProps, timeout, id, onClose, priority); the unused sonner
methods are removed and close replaces dismiss. toaster holds toasts shown before the Toaster
mounts, which retires toast-store.ts, and ReloadPrompt shows a persistent toast. Apps that import
sonner directly, pass sonner-only options or use useToastStore adjust those calls by hand.

## What & why

`sonner` is removed: toasts render through Base UI Toast in `frontend/src/modules/ui/toast.tsx`, ported from the
shadcn base toast, so the app runs on one primitive library. `toaster.<severity>(message, options)` keeps its
shape, but `options` are Base UI's (`description`, `actionProps`, `timeout`, `id`, `onClose`, `priority`).
`loading`, `message`, `promise`, `custom`, `dismiss`, `getHistory` and `getToasts` are gone; `close` stays.
`toast-store.ts` is gone because `toaster` holds toasts until the `Toaster` mounts. `ReloadPrompt` is a toast.

## Blast radius

Frontend only. Sync-breaking for an app that imports `sonner`, passes sonner-only options (`action`, `duration`,
`cancel`, `icon`), calls a removed method or uses `useToastStore`. Plain `toaster.<severity>(message)` calls are
unaffected. No `clientCacheVersion` bump, no database change.

## Run

No script: manual.

## Manual steps

1. Delete `frontend/src/modules/ui/sonner.tsx` and `frontend/src/modules/ui/stories/sonner.stories.tsx` if the sync kept them, remove `sonner` from `frontend/package.json`, then `pnpm install`.
2. `rg "from 'sonner'" frontend/src`: import `toaster` from `~/modules/common/toaster/toaster` and call `toaster.<severity>(...)` in place of `toast.<severity>(...)`.
3. `rg -A4 "toaster(\.[a-z]+)?\(" frontend/src | rg "action:|duration:|cancel:"`: `action: { label, onClick }` becomes `actionProps: { children, onClick }` (the action leaves the toast open; call `toaster.close(id)`), `duration` becomes `timeout` (`0` keeps the toast open).
4. `toaster.dismiss(id)` becomes `toaster.close(id)`. For `promise` or `loading`, show `toaster(message, { id })` and call again with the same `id` to update the open toast.
5. `useToastStore.getState().showToast(message, severity)` becomes `toaster[severity](message)`.

## Verify

```sh
rg "sonner|toast-store" frontend/src
pnpm check
```
