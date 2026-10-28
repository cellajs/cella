---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: SelectionActionBar, 'Escape'
---

# Escape clears a selection

An app with its own Escape handler on a page that shows a `SelectionActionBar`, such as a board's hotkeys, clears that
selection itself as the last step of the handler. For raak: `handleEscape` in `frontend/src/modules/task/tasks-hotkeys.tsx`
clears `selectedTaskIds` where it would return without acting.

## What & why

`SelectionActionBar` clears the selection on Escape and announces `c:success.clear_selection` through `announce()`, now
`common/announce.ts` (was `common/reorder-handle/announce.ts`); its Clear button announces too. It leaves an Escape that
was prevented, typed in a field, or taken by a tooltip or the delete confirmation. `useHotkeys` prevents the default of
every Escape it matches, so a page with its own Escape hotkey keeps the bar from seeing the key.

## Blast radius

Apps whose pages register Escape through `useHotkeys`, or a `keydown` listener that prevents the default, beside a
`SelectionActionBar`. Tables without such a handler get the behavior for free. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each such handler, clear the selection when nothing else took the key: after hover content, drafts, expanded items and sheets.
2. raak: in `handleEscape`, where it returns because there is no active task, call `setSelectedTaskIds([])` from `taskInteractionStore` when tasks are selected, and `announce()` `c:success.clear_selection` as the bar does.
3. An app import of `~/modules/common/reorder-handle/announce` moves to `~/modules/common/announce`.

## Verify

```sh
pnpm check
```

By hand on the board: select tasks, open a card, press Escape. The card collapses first; the next Escape clears the
selection.
