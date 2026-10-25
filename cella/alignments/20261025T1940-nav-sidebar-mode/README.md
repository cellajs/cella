---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
---

# Config gains navSidebarMode

Add `navSidebarMode: 'menu' as NavSidebarMode` to the app's `shared/config/config.default.ts`, beside
`menuStructure`, and import `NavSidebarMode` from `../src/config-builder/types.ts`. `'menu'` keeps the
navigation as it is; `'organizations'` turns it to a rail button per organization.

## What & why

`RequiredConfig` gained `navSidebarMode`, read by `SidebarNav`, `AppNav` and `MenuSheet`. With
`'organizations'` the desktop rail shows a button per organization in place of the menu button, each
opening a menu sheet of that organization alone, the menu button moves below them as an ellipsis, and
the mobile menu sheet gains an organization switcher.

## Blast radius

Sync-breaking for every app: its own config lacks the key, so `satisfies RequiredConfig` and the
frontend reads fail to compile until it is added. No `clientCacheVersion` bump, no lens, no database
change.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, add `navSidebarMode: 'menu' as NavSidebarMode,` after
   `menuStructure` and add `NavSidebarMode` to the type import from `../src/config-builder/types.ts`.

## Verify

```sh
pnpm check
```
