---
breaking: false
clientCacheBump: false
grep: return row.id, group-active/cell-button:press, max-w-full lg:max-w-4xl
---

# Tables key rows with rowKeyById, cell buttons press once, sheets drop inert width classes

App-owned tables that key rows by id can pass `rowKeyById` from `common/data-table/data-table` in place of their own
`rowKeyGetter`. Labels and avatars inside a `cell` Button drop `group-active/cell-button:press`, and sheets opened on
the right drop `className: tw('max-w-full lg:max-w-4xl')`.

## What & why

Nine template tables wrote the same `row.id` getter: `rowKeyById` replaces them. A `cell` Button already presses
itself (`active:press`), so a child with `group-active/cell-button:press` moved twice as far; `cellLinkTextClass` no
longer carries it. A right-side sheet already caps at `lg:max-w-4xl`, and `max-w-full` never binds on its 90vw width.

## Blast radius

Not breaking: app code keeps compiling and rendering. An app-owned cell child that keeps the class still presses
twice; an app-owned sheet that keeps the classes renders the same. No database, lens or cache change.

## Run

No script: manual.

## Manual steps

1. In each app-owned table whose `rowKeyGetter` returns `row.id`, delete the function and pass `rowKeyGetter: rowKeyById`.
2. Remove `group-active/cell-button:press` from classes inside a `variant="cell"` Button.
3. Remove `className: tw('max-w-full lg:max-w-4xl')` from right-side sheets.

## Verify

```sh
pnpm check
```
