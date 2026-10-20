---
syncBreaking: true
clientCacheBump: false
---

# Spinner takes a size, PageSpinner is gone

`~/modules/common/spinner` no longer exports `PageSpinner`. An app file that imports it renders
`<Spinner size="lg" className="mt-[45vh]" />` instead. `Spinner` takes `size="sm" | "md" | "lg"` (16, 32 and 48px,
default `md`) in place of a `size-*` class.

## What & why

Spinners had drifted to six sizes, and the attachment viewer showed a 24px spinner right after a 48px one. Three sizes
remain: `sm` in a button or input, `lg` when the spinner is the only thing on a screen, sheet or dialog, `md` for the
rest. The default grew from 24 to 32px.

## Blast radius

Typecheck fails in app-owned files that import `PageSpinner`, such as an app-owned `marketing/layout.tsx`. An app's
own `<Spinner />` without a size class grows from 24 to 32px. No database or cache change.

## Run

No script: manual.

## Manual steps

1. Replace each `PageSpinner` import and element: `<PageSpinner />` becomes `<Spinner size="lg" className="mt-[45vh]" />`; inside a parent that already centers it, drop the `mt-[45vh]`.
2. In the app's own files, replace `<Spinner className="size-4">` with `size="sm"` and `size-10`/`size-12` with `size="lg"`; a `size-6` that should stay 24px keeps its class.

## Verify

```sh
pnpm check
```
