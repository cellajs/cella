---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# ExternalArrow lives in common

`ExternalArrow` moves from `frontend/src/modules/marketing/external-arrow.tsx` to
`frontend/src/modules/common/external-arrow.tsx`. An app that owns its marketing module imports it from
`~/modules/common/external-arrow` and deletes its own copy.

## What & why

The contact form in `common/contact-form/contact-methods.tsx` belongs to the template and imported `ExternalArrow`
from the marketing module. An app that owns that module never receives the template's copy, so the contact form
failed to compile there. The arrow now lives in `common/`, where both modules read it.

## Blast radius

An app with an app-owned marketing module: its marketing files import the old path, which the compiler flags once the
upgrade moves the file. An app that never took the marketing module over gets the change as it is. No wire, cache or
schema change.

## Run

No script: manual.

## Manual steps

1. In the app's marketing files, replace `~/modules/marketing/external-arrow` with `~/modules/common/external-arrow`.
2. Delete `frontend/src/modules/marketing/external-arrow.tsx` when the upgrade left a copy there.

## Verify

```sh
pnpm check
```
