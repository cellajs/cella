---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: retentionPeriod
---

# Legal retention periods are lines

`SharedDataType.retentionPeriod` is now `string[]`, so an app turns each `retentionPeriod` string in its own `frontend/src/modules/auth/legal/legal-config.ts` into an array with one entry per line.

## What & why

The privacy tables stack on a phone, and a long retention text read as one block there. `retentionPeriod` in `legal-types.ts` now holds one line per entry. Subprocessor names and lists read better with `servicesProvided` and `categoriesOfPersonalData` in sentence case, which is optional for an app.

## Blast radius

Every app, because `legal-config.ts` is app-owned and typecheck flags each entry. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. In `legal-config.ts`, wrap each `retentionPeriod` in an array, splitting a text that covers several kinds of data into one entry per kind.

## Verify

```sh
pnpm check
```
