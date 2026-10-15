---
syncBreaking: true
clientCacheBump: false
---

# Shortcuts need a modifier, and increased contrast keeps messages open

The navigation shortcuts are `Alt + M` (menu), `Mod + K` (search) and `Alt + A` (account), no longer `Shift + M/F/A`.
Update the key presses in your pinned `a11y/scope-config.ts` and `cella/skills/screenshots/shots-config.mjs`. The
`Keyboard shortcuts` and `Keep messages open` preferences are gone: toasts stay until closed when contrast is
increased, by the user's `contrast` column or the device's `prefers-contrast: more`.

## What & why

Two switches in the menu sheet's Preferences were too many for the few who need them. `keyboardShortcuts`
(`navigation-store.ts`) and `keepMessages`/`setKeepMessages` (`ui-store.ts`) are removed, with their locale keys.
Shortcuts with Ctrl, Alt or Meta pass WCAG 2.1.4 without a switch. `toaster.ts` keeps toasts open under increased
contrast, which also reaches signed-out pages through the device setting. `Mod` in `useHotkeys` now matches Ctrl or Meta.

## Blast radius

Sync-breaking for an app's audit and screenshots: their pinned configs press keys that no longer open the sheets.
Apps whose own hotkeys use a character alone or with Shift now fail the `code:shortcuts` check. No database change,
no cache bump.

## Run

No script: manual.

## Manual steps

1. `a11y/scope-config.ts`: press `Alt+M` for the menu sheet, `ControlOrMeta+K` for search and `Alt+A` for account.
2. `cella/skills/screenshots/shots-config.mjs`: `openMenu` presses `Alt+M`.
3. `rg "\['(Shift \+ )?[A-Za-z0-9]'," frontend/src` and give each of your own hotkeys `Mod`, `Alt` or `Ctrl`.
4. `rg "keyboardShortcuts|keepMessages|keep_messages|keyboard_shortcuts" frontend/src locales` and drop what is left.
5. `frontend/src/modules/auth/legal/legal-config.ts`: the 2.2.1 workaround now reads that more contrast keeps messages open.
6. Rerun `pnpm a11y:run`, then record 2.2.1 again with `pnpm -C a11y decide`: its remarks still name 'Keep messages open'.

## Verify

```sh
pnpm --filter frontend exec vitest run src/modules/common/toaster/toaster.test.ts
pnpm check
```
