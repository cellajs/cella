---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: navSidebarMode, NavSidebarMode
---

# Config navigation replaces navSidebarMode

Replace `navSidebarMode` in the app's `shared/config/config.default.ts` with
`navigation: { navBar: true, menu: 'all', pageTabs: {} } as NavigationConfig<(typeof hierarchy.channelTypes)[number]>`,
and import `NavigationConfig` in place of `NavSidebarMode`. `'menu'` becomes `menu: 'all'`, `'organizations'`
becomes `menu: 'perOrganization'`. A pinned `nav-items.tsx` gains the `home` item and moves `account` to the footer.

## What & why

`RequiredConfig.navSidebarMode` gave way to `navigation`: `navBar` (the nav button strip, or a menu that stays
open with a floating menu button on phones), `menu` (`all` or `perOrganization`) and `pageTabs` (channel types
whose page tabs show in the menu). The account ends every nav bar; a desktop bar of organization buttons leads with
the app icon going home, elsewhere the menu header links home. Home gains a `channels` section in `home.sections`.

## Blast radius

Breaking for every app: its config lacks `navigation`, so the compiler stops it. An app with its own home
section shows the new `channels` section beside it until it lists `home.sections` in `appConfig.surfaces`. No
cache bump, lens or database change.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, replace the `navSidebarMode` line as the summary says, keeping the app's mode.
2. In a pinned `frontend/src/modules/navigation/nav-items.tsx`, add the `home` item first, give `menu` the `AppNavLoader` icon slot and `account` `type: 'footer'`.
3. An app with its own home sections lists them in `appConfig.surfaces['home.sections']`, with or without `channels`.

## Verify

```sh
pnpm check
```
