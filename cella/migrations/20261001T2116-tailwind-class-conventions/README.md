# Tailwind class conventions

## What & why

The `icon-xs…icon-xl` utilities are removed: icons use `size-3…size-6`. Buttons space their content with a gap, so
margins on a button's children (`mr-2` on icons) double the spacing. Button's cell variant, Toggle's tile variant and
the accordion header name their groups (`group/cell-button`, `group/toggle`, `group/accordion-header`), so children
use `group-hover/cell-button:` and the like. `intent-*` and `text-2xs` replace `[--intent-color:var(--x)]` and
`text-[0.6rem]`.

## Blast radius

Frontend only. Sync-breaking for app files that use `icon-*`, put icon margins inside buttons, or style children of
those three components with unnamed `group-*` variants. No `clientCacheVersion` bump, no database change.

## Run

```sh
pnpm exec tsx cella/migrations/20261001T2116-tailwind-class-conventions/tailwind-class-conventions.ts inventory frontend/src   # report only
pnpm exec tsx cella/migrations/20261001T2116-tailwind-class-conventions/tailwind-class-conventions.ts rewrite   frontend/src   # apply
pnpm lint:fix
```

## Manual steps

1. Buttons whose children are a fixed multi-column layout (not an icon and a label) add `gap-0`.
2. Custom `JsonViewerTheme` objects add `structureType` (the array/object type color).
3. Calls to `ApiReferenceSection` drop the `isMobile` prop.

## Verify

```sh
rg "icon-(xs|sm|md|lg|xl)\b" frontend/src
pnpm check
```
