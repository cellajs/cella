---
syncBreaking: true
clientCacheBump: false
roots: frontend/src
---

# Tailwind class conventions

The icon-xs to icon-xl utilities are removed; icons use size-3 to size-6. Button content is spaced
by a gap on the button base (gap-2, gap-1.5 for sm and xs, gap-1 for micro), so margins on a
button's direct children are dropped. Button's cell variant, Toggle's tile variant and the accordion
header name their groups (group/cell-button, group/toggle, group/accordion-header) and their
children use the named variants. intent-* replaces [--intent-color:var(--x)] and text-2xs replaces
text-[0.6rem]. The press nudge is the press utility (active:press, a transform); Button takes
press={false} where apps cancelled it with active:translate-y-0!. JsonViewerTheme gains
structureType and ApiReferenceSection drops its isMobile prop. pnpm style fails on class names that
compile to no CSS; deliberate hooks go under markerClasses in shared/config/vocabulary-allowlist.ts.
The codemod rewrites the classes; pnpm lint:fix re-sorts them.

## What & why

The `icon-xs…icon-xl` utilities are removed: icons use `size-3…size-6`. Buttons space their content with a gap, so
margins on a button's children (`mr-2` on icons) double the spacing. Button's cell variant, Toggle's tile variant and
the accordion header name their groups (`group/cell-button`, `group/toggle`, `group/accordion-header`), so children
use `group-hover/cell-button:` and the like. `intent-*`, `text-2xs` and `active:press` replace `[--intent-color:var(--x)]`,
`text-[0.6rem]` and `active:translate-y-[.05rem]`.

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
4. Buttons that cancelled the press nudge with `active:translate-y-0!` pass `press={false}` instead; the class no
   longer cancels it, since the nudge is now a `transform`.
5. `pnpm style` now fails on class names that compile to no CSS: fix each one, or list a deliberate hook under
   `markerClasses` in `shared/config/vocabulary-allowlist.ts` with its reason.

## Verify

```sh
rg "icon-(xs|sm|md|lg|xl)\b" frontend/src
pnpm check
```
