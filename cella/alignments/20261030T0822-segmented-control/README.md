---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# ToggleGroup gives way to SegmentedControl

Each app `ToggleGroup` that holds one selected value becomes `SegmentedControl` with `SegmentedControlItem` (`~/modules/ui/segmented-control`), and a `ToggleGroup` of action tiles becomes `Button`s. `ui/toggle-group.tsx`, the `Toggle` props `variant`, `xs`, `lg` and `tile`, and the `TabsList` prop `variant` are gone.

## What & why

A pressed item in a `ToggleGroup` read poorly as the current value, and clicking it cleared the value, so each caller guarded against that. `SegmentedControl` builds on Base UI's radio group: a pill marks the selection, which cannot be cleared, and arrow keys move it. `SegmentedNav` is the same control for options that are routes. `tabs.tsx` takes the same track and pill.

## Blast radius

Breaking for any app that imports `toggle-group`, passes `variant` to `TabsList` or `variant`, `xs`, `lg` or `tile` to `Toggle`; typecheck names each one. No lens and no database change. An app with none of these is unaffected.

## Run

No script: manual.

## Manual steps

1. Replace a single-value `ToggleGroup` with `SegmentedControl` and drop `type`, `variant`, the guard against an empty value and `string | string[]`: `onValueChange` hands the item's value. Size moves to the control (`default`, `sm` or `xs`).
2. Remove item classes that restyled the pressed state (`data-pressed:*`, `font-normal`, `tabIndex`). Keep `flex-1` on items and `w-full` on the control for a full-width row.
3. Options that are routes use `SegmentedNav`, with `<Link className={segmentClassName}>` children and `activeOptions={{ exact: true }}` on a link whose route is a parent of another option.
4. A copy of `ViewToggle` (`common/view-toggle.tsx`) becomes a call to it.
5. Replace a tile `ToggleGroup` that starts a flow with `Button variant="outline" size="auto"` and an `onClick`, as `user/invite-users.tsx` does.
6. Read app `TabsList` styling: its default now draws `bg-muted`, `border-input` and a smaller radius.

## Verify

```sh
pnpm check
```
