---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: popupMotionClass, stuckEdgeClass, collapsiblePanelClass, cellLinkTextClass, blockNoteFieldClass, menuHairlineClass, menuColumnsClass, floatingHiddenClass, sidebarBulletClass, authFieldClass, attachmentDialogStageClassName, SheetDescription, DrawerDescription, SelectTrigger, size="icon"
---

# Shared class constants become utilities, components and variants

Exported class constants leave the template. `popupMotionClass` and `stuckEdgeClass` become the `popup-motion` and
`stuck-edge` utilities, and `cellLinkTextClass` becomes `<CellLabel>`. `menuHairlineClass` becomes `<NavSheetDivider>`,
and `floatingHiddenClass` becomes the `concealed` prop. `collapsiblePanelClass` and `blockNoteFieldClass` become defaults
of `CollapsibleContent` and `BlockNoteContentFormField`. `SheetDescription` and `DrawerDescription` take their header's
inset. `SelectTrigger` loses its `size` prop.

## What & why

A class string that several files share now lives in a utility, a component or a primitive variant, never in an
imported string (rule in `frontend/README.md`, UI styling). Button gains `icon-micro` (size-6), `icon-xs` (size-8),
`icon-sm` (size-9) and a `nav` variant. `DialogTitle` drops `leading-none`, and `menuColumnsClass` moves to
`navigation/menu-sheet/item.tsx`.

## Blast radius

Breaking for app code that imports a removed constant: the compiler flags each one. The description inset, the title
leading and the animated `CollapsibleContent` change what app code renders without a compile error. No wire, cache or
schema change.

## Run

No script: manual.

## Manual steps

1. `popupMotionClass` and `stuckEdgeClass`: write `popup-motion` or `stuck-edge` in the class list and drop the import.
2. `cellLinkTextClass` on a span inside a `cell` Button: render `<CellLabel>` from `~/modules/common/data-table/columns` with the span's other classes.
3. `collapsiblePanelClass` on `CollapsibleContent`: delete the class; pass `animated={false}` where a panel must open without the height animation.
4. `blockNoteFieldClass` in `baseBlockNoteProps.className`: delete it and keep the other classes; the field adds the frame, its fill and the invalid edge.
5. `menuHairlineClass`: render `<NavSheetDivider className=…>` from `~/modules/navigation/nav-sheet-divider`; import `menuColumnsClass` from `~/modules/navigation/menu-sheet/item`.
6. `floatingHiddenClass` on a `FloatingNavButton`: pass `concealed` instead.
7. `sidebarBulletClass` and its rail line: render `<SidebarRail expanded line lineClassName>` from `~/modules/docs/sidebar/docs-sidebar-section`.
8. `authFieldClass`: write `cn('h-12 rounded-xl', glassClass)`; `attachmentDialogStageClassName`: write `pt-12 sm:pb-14`.
9. A `SheetDescription` or `DrawerDescription` outside the sheeter: drop a hand-written `px-4 pb-4` or `px-3 pb-4`, or override the new inset where the description sits elsewhere.
10. A `SelectTrigger size="sm"`: delete the prop and add `h-8` to its classes.
11. Optional: a `Button size="icon"` with a `size-6`, `size-8` or `size-9` class takes `icon-micro`, `icon-xs` or `icon-sm`.

## Verify

Open a dialog, a sheet with a description and a collapsible panel of the app's own, and compare them with the
template's.

```sh
pnpm check
```
