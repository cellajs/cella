---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The board store keeps only what something reads

`common/board/board-store.ts` drops `activeBoardType`, `activePanelId` and `setActivePanel`. `setActiveBoard` takes
the board id alone, and `togglePanelCollapsedState(panelId, collapsed)` is `setPanelCollapsed(panelId, collapsed)`.
`BoardLayout` also drops its `className`, `groupClassName` and `separatorClassName` props.

## What & why

The store held a board type and an active panel that apps wrote and nothing read, and its collapse setter was named a
toggle although it sets the value it is given. The board layout's class props had no caller.

## Blast radius

App code that writes the removed fields, passes a board type to `setActiveBoard` or calls the old setter. Known sites
are all in raak; projectcampus has none. The persisted fields stay, so no store version or cache change.

## Run

No script: manual.

## Manual steps

1. raak `frontend/src/modules/task/board/task-board.tsx`: call `setActiveBoard(boardId)` without the board type.
2. raak `frontend/src/modules/task/board/mobile-board.tsx` and `frontend/src/modules/task/panel/task-panel-content.tsx`: remove the `setActivePanel` selector and its calls (nothing read the value).
3. raak `frontend/src/modules/task/helpers/create-task.ts`: `boardStore.getState().setPanelCollapsed(panelId, false)`.
4. Drop any `className`, `groupClassName` or `separatorClassName` passed to `BoardLayout`.

## Verify

```sh
pnpm check
```
