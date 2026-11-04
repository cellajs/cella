---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: FloatingNavButton, enableStickyHeader, createTaskDialogClassName, data-compact
---

# A list's main action floats on a phone; phone dialogs fill the screen

`TableBarShell` and `EntityGridBar` take `action={{ icon, label, onClick }}` in place of `actions`: `label` is translated
text and `onClick` receives the trigger ref. On a phone page the action renders as `FloatingAction`
(`~/modules/navigation/floating-nav/floating-action`). Below `sm` a dialog that is neither docked nor inline fills the
screen, header rows never pin, and system pages float the menu. raak: `task/panel/board-panel.tsx`,
`task/mobile-create-task-dialog.tsx`, `task/table/tasks-table.tsx`; projectcampus: the course, course section and
project grids and tables.

## What & why

On a phone the bar's row held a labelled action, a stacked count, search and view. It now holds the count on one line,
and the action floats bottom right with its word shown at the top of the page. `TableCount` no longer stacks its extra,
and a zero pending count hides. `FloatingNavButton` takes `variant`, its hidden classes are `floatingHiddenClass`, and
`DialogContent` writes `--visual-viewport-height` itself.

## Blast radius

Bars passing `actions` to `TableBarShell` or `EntityGridBar` fail to compile. App dialogs with `drawerOnMobile: false`
or a direct `DialogContent` fill the phone screen, so their own phone sizing classes become redundant. No database, lens
or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. `actions={<TableBarButton ref={ref} icon={X} label="c:key" onClick={() => open(ref)} />}` becomes `action={{ icon: X, label: t('c:key'), onClick: (triggerRef) => open(triggerRef) }}`; a list in a sheet adds `floatAction={false}`.
2. projectcampus `CreateChannelButton`, passed as `actions` to the course, course section and project grids and tables: pass `action={{ icon: PlusIcon, label: t('c:create_resource', { resource }), onClick: (triggerRef) => openCreateChannelDialog(target, triggerRef) }}`, which the tables forward to `TableBarShell`.
3. raak `task/panel/board-panel.tsx`: `FloatingNavButton` with its own `useScrollVisibility` and hidden classes becomes `<FloatingAction icon={PlusIcon} label={t('c:create_resource', { resource: t('c:task') })} onClick={(triggerRef) => openCreateTaskDialog(..., triggerRef)} />`; `board-skeleton.tsx` renders the same inside `inert`, or drops its placeholder.
4. raak `task/mobile-create-task-dialog.tsx`: drop `createTaskDialogClassName`, since the dialog fills the phone screen by itself, and take the trigger ref in place of `{ current: null }`, so focus returns to the button on close.
5. raak `task/table/tasks-table.tsx`: drop `enableStickyHeader: true`; header rows no longer pin below `sm` whatever the prop says.
6. A dialog of the app's own that draws its own full screen with `p-0` adds `max-sm:pt-0`, as the attachment viewer does.
7. A route whose pages float an action leaves `floatingNavButtons.right` empty.

## Verify

```sh
pnpm check
```

By hand at 390 px: the members tab shows the count on one line and a floating Invite with its word at the top; after a scroll it is a circle, and it opens invite full screen.
