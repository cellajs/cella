---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: docs-floating-nav, marketing-floating-nav
---

# FloatingNav takes no bodyClass

`FloatingNav` drops its `bodyClass` prop: every floating nav sets `floating-nav` on `<body>` while it shows. Remove the
`bodyClass="marketing-floating-nav"` the app's `marketing/nav.tsx` passes.

## What & why

Docs and marketing passed `docs-floating-nav` and `marketing-floating-nav`, which no stylesheet, script or app selects.
The `floating-nav` readers (app layout, menu sheet header) render outside docs and marketing, so the shared class
changes nothing they show.

## Blast radius

The app-owned marketing module: raak and projectcampus `frontend/src/modules/marketing/nav.tsx`. `docs-layout.tsx`
arrives with the sync. An app stylesheet that selects either old class loses it. No cache or database change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/modules/marketing/nav.tsx`, remove `bodyClass="marketing-floating-nav"` from `<FloatingNav>`.
2. Move any app style scoped to `.docs-floating-nav` or `.marketing-floating-nav` onto `.floating-nav` under the page's own layout.

## Verify

```sh
pnpm check
```
