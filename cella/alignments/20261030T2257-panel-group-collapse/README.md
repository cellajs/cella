---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: groupHeader, usePanelToggle, panelCollapseState
---

# Panels in a group no longer collapse

A `BoardLayout` panel with a `group` no longer collapses: its handle calls the new `onGroupCollapse(groupId)` prop, and `usePanelToggle` does nothing for it. An app that has groups passes `onGroupCollapse` and swaps the group for one collapsed panel under the group's id.

## What & why

`BoardLayout` collapsed each panel of a group apart, which left a row of narrow strips under one header. The handle now hands the group to the app through `onGroupCollapse`, and grouped `ResizablePanel`s render with `collapsible` off. Expanding the single panel back is app state as well.

## Blast radius

Only apps that set `group` on a `BoardLayout` panel. Without the prop, the handle's collapse does nothing and no error reports that. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. For each `BoardLayout` with `groupHeader`, pass `onGroupCollapse` and render one panel with `panelId` equal to the group id while the group is collapsed.
2. Replace any `usePanelToggle` call on a panel in a group with the same app state.

## Verify

```sh
pnpm check
```

Press a group's handle on a board: the group becomes one collapsed panel, and focus stays on the handle.
