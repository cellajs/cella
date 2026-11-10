---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Config page sizes and body size

In `shared/config/config.default.ts`, `requestLimits` is `pageSizes` and `jsonBodyLimit` is `maxBodySize`, and app code
reads `appConfig.pageSizes` and `appConfig.maxBodySize`. The type `RequestLimitsConfig` is `PageSizesConfig`.

## What & why

`requestLimits` holds the default page size of each list: a list query's `maxPageSize` fallback and a frontend list's
`limit`. It limits no request. `jsonBodyLimit` caps a request body of any content type, not JSON alone. Each key now
says what it holds.

## Blast radius

Every app: its config and every read fail typecheck until renamed. No wire, cache or schema change: the page sizes and
the body cap keep their values.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts` and any mode config that sets them, rename `requestLimits` to `pageSizes` and `jsonBodyLimit` to `maxBodySize`.
2. Replace `appConfig.requestLimits` with `appConfig.pageSizes`, `appConfig.jsonBodyLimit` with `appConfig.maxBodySize` and `RequestLimitsConfig` with `PageSizesConfig`.

## Verify

```sh
pnpm check
```
