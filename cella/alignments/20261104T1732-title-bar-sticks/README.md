---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: with-close-btn, DialogHeader, SheetHeader, DrawerHeader, headerClassName, update_tenant, overscroll-contain, header-pinned
---

# Only an overlay's title bar sticks

`DialogHeader`, `SheetHeader` and `DrawerHeader` are a one-row title bar: the title, anything after it and a close button (`closeButton`). A description renders after the bar and scrolls away, so an app's own header with a `*Description` inside moves it below; `with-close-btn` is gone. raak: `task/task-sheet-handler.tsx` and `project/project-actions.tsx` drop `headerClassName: 'static'`, and the task options menu moves into the bar through `titleAside`. Overscroll bounce is off app-wide, so an app's own `overscroll-contain` becomes `overscroll-none`. projectcampus builds no header of its own and only checks by hand.

## What & why

Only the title row of a dialog, sheet or drawer sticks, at every width, and a hairline shows under it once content runs beneath. A dialog that turns into a bottom drawer on a phone now sticks its title too, below the handle. Sheets and side drawers gain a close button. The sheeter takes `titleAside`; `openEditSheet` takes `identifier`, shown as a `CopyChip`. A pinned description took up to a sixth of a phone screen, and the bounce moved the bar with the content.

## Blast radius

Apps whose own code builds a header with a description inside it, passes `with-close-btn`, overrides `update_tenant.text`, or sets `headerClassName: 'static'` on a sheet. Apps that only open overlays through the dialoger and sheeter get the change for free. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. An app's own `DialogHeader`, `SheetHeader` or `DrawerHeader`: move its `*Description` after the header (`px-4 pb-4` in a sheet, `px-3 pb-4` in a drawer), give the title `min-w-0 truncate`, drop `with-close-btn`, and pass `closeButton={false}` where no close button belongs.
2. raak `task/task-sheet-handler.tsx`: drop `headerClassName: 'static'`, pass the task's `TaskOptionsButton` (read from the task cache as `TaskSheetTitle` does) as `titleAside` with `ml-auto`, and leave it out of `task-card-header.tsx` when `isSheet`.
3. raak `styling/app.css`: `--task-sheet-offset-sm` becomes `3.5rem`, the sheet's bar; `--task-sheet-offset` stays `3rem`, the phone drawer's bar.
4. raak `project/project-actions.tsx`: drop `headerClassName: 'static'` from the members sheet.
5. An app's own scroller with `overscroll-contain` (raak: the viewport in its `ui/sheet.tsx`, `task/dropdowns/select-members.tsx`, `select-labels.tsx`) takes `overscroll-none`, so Safari does not bounce it.
6. An override of `update_tenant.text` or `update_tenant_no_organization.text` in `locales/*/app.json` drops `{{id}}`: the id shows as a chip after the title.

## Verify

```sh
pnpm check
```

By hand at 1280 and 390 px, on a sheet and a dialog with a description: the title bar and its close button stay, the description scrolls away, and a line shows under the bar once scrolled. raak: a long task keeps the project, `#ref`, options and close in view. No scroller bounces at its ends.
