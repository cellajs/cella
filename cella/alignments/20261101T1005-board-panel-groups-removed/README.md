---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: groupHeader, onGroupCollapse, usePanelToggle, PanelToggleContext, data-panel-group
---

# BoardLayout no longer groups panels

`BoardLayout` drops `BoardLayoutPanel.group` and the `groupHeader` and `onGroupCollapse` props, along with `data-panel-group`. `board-drag.ts`
drops `usePanelToggle`, `PanelToggleContext` and `isCollapsed` on the drag context. An app that used them gives each panel its own header.

## What & why

Panel groups existed for one app feature that went away. A panel's handle again moves and collapses that panel alone, so a collapsed strip calls
`usePanelDragHandle()?.onToggleCollapsed()` instead of `usePanelToggle()`, and `PanelDragHandleButton` reads the collapsed state from `useBoardStore`.

## Blast radius

Apps that pass `group` to `BoardLayout` or call `usePanelToggle`. The compiler flags both; a `data-panel-group` selector needs the grep. An app that
never used groups is unaffected. No `clientCacheVersion`, lens or database change.

## Run

No script: manual.

## Manual steps

1. Replace `usePanelToggle()` with `usePanelDragHandle()`, and `toggle?.(panelId)` with `panelDrag?.onToggleCollapsed()`.
2. Give each grouped panel its own header, and remove `group`, `groupHeader`, `onGroupCollapse` and `data-panel-group` selectors.

## Verify

```sh
pnpm check
```
