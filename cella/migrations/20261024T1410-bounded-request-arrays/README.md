---
syncBreaking: true
clientCacheBump: false
---

# Every request array and record has a size limit

Give every request array in the app's own schemas a `.max()`, placed before any `.refine()` or `.superRefine()`, and
build every string-keyed request record with `boundedRecord(value, maxKeys)` from `#/schemas/common-schemas`, or with
`z.partialRecord` over an enum when its keys are known. `backend/tests/security/request-bodies.test.ts` reads the app's
OpenAPI document and lists each request array without `maxItems` and each request record without `maxProperties`.

## What & why

Zod adds an issue for every element that fails (GHSA-mrhx-c7xc-m3w5, AIKIDO-2026-143019), so one failing 1 MB array cost 524k issues,
285 MB of heap and a 100 MB error log line. Zod 4.6.6 refuses an array over its `.max()` before any element parses,
which turns that into one issue. `defaultHook` now passes only the first issue on, with its path in `meta.path`.

## Blast radius

Every app with request schemas of its own: the security test fails on each array or record without a limit. No client
cache bump, no lens and no database change. An app that only uses template routes is unaffected.

## Run

No script: manual.

## Manual steps

1. Check that `pnpm why zod` shows 4.6.6 or later in every package.
2. Run `pnpm --filter backend test tests/security/request-bodies.test.ts` to list the arrays and records without a limit.
3. Add a `.max()` to each listed array before any refinement: zod checks the size early only while no refinement precedes it.
4. Pick a fixed cap where a cap from config can equal the array's `.min()`: the SDK then generates a tuple type.
5. Build each listed record with `boundedRecord(value, maxKeys)`, or with `z.partialRecord(z.enum(keys), value)`.
6. Drop `originalError` where an app-owned validation hook passes a whole `ZodError` to an `AppError`; `defaultHook` sets `meta.path`.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```
