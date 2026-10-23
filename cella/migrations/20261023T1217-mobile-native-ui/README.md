---
syncBreaking: true
clientCacheBump: false
---

# Phone-native chrome: press dims on touch, drawer rows, no themeColor

Pinned `tailwind.css` takes the new `press` utility, the `standalone` variant and the transparent tap highlight.
`DropdownActionItem` and `DropdownSelectItem` drop `isMobile`, and `variant` narrows to `'default' | 'destructive'`.
`appConfig.themeColor` is removed. Drawer pickers in app code move to `Button variant="row"` inside `DrawerRowGroup`.

## What & why

Fields, controls and buttons lose `shadow-xs`. In the dropdowner's mobile drawer, menus and confirmations show
action-sheet rows (`Button variant="row"`, `DrawerRowGroup`), so a destructive row has red text instead of a red
block. The row reads the drawer from context. On touch, `press` dims instead of nudging. The `theme-color` meta follows
the page background through `Themer`, which leaves `themeColor` unused. Search dialogs take `searchLayout`.

## Blast radius

Sync-breaking: a pinned `tailwind.css` lacks `standalone:` (synced classes compile to nothing, and `pnpm style` fails),
`isMobile` call sites fail tsc, and so does a `themeColor` key in an app config. A pinned `vite.config.ts` keeps the
old manifest color. No database or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/styling/tailwind.css`, replace `@utility press` with cella's, add `@custom-variant standalone (@media (display-mode: standalone));` after it, and add `-webkit-tap-highlight-color: transparent;` to the `html` rule in `@layer base`.
2. Delete `isMobile` wherever app code passes it to `DropdownActionItem` or `DropdownSelectItem`; map any other `variant` to `default`.
3. Rebuild app drawer rows that copied the old secondary buttons (raak `task/dropdowns/combobox-scaffold.tsx`, projectcampus `label/combobox-scaffold.tsx`) as `Button variant="row"` inside `DrawerRowGroup`.
4. Delete `themeColor` from `shared/config/config.default.ts` and any mode config.
5. If you pin `frontend/vite.config.ts`, drop `color: appConfig.themeColor` from `indexHtml(...)` and set the manifest `theme_color` to `'#ffffff'`.
6. App dialogs that open a search: pass `searchLayout: true` and wrap the field in `SearchDialogBar`.

## Verify

```sh
pnpm style
pnpm check
```
