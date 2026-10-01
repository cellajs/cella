# Slot replaced by Base UI useRender

## What & why

`frontend/src/modules/ui/slot.tsx` is removed. `Button`, `Badge`, `ButtonGroupText`, `BreadcrumbLink` and the sidebar
parts with a `render` prop build on Base UI's `useRender`, like upstream shadcn. Props merge as before (the render
element wins, class names join, both handlers run), refs now merge where `Slot` dropped the outer one, and `render` also
accepts Base UI's function form.

## Blast radius

Frontend only. Sync-breaking only for an app that imports `~/modules/ui/slot`. Call sites passing `render={<Link />}`
are unaffected. No `clientCacheVersion` bump, no database change.

## Run

No script: manual.

## Manual steps

1. `rg "ui/slot'" frontend/src`: build the component on `useRender` from `@base-ui/react/use-render` (`useRender({ defaultTagName, render, props })`), as `frontend/src/modules/ui/badge.tsx` does.

## Verify

```sh
rg "ui/slot'" frontend/src
pnpm check
```
