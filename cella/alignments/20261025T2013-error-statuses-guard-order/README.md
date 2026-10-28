---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: XMiddlewareOptions, errorResponses, registerAllErrorResponses
---

# AppError statuses close, guards declare their order

`AppError` takes only an `AppErrorStatus` (`backend/src/core/error.ts`), and `createXRoute` refuses at load a route
whose guard `requires` context (`actor`, `session`, `tenant`) that no earlier guard `provides`. An app guard built with
`xMiddleware` declares what it reads and sets.

## What & why

`AppErrorStatus` holds the documented error codes, 410, 413, 500 and 503, so every status a route throws has a
documented response. `xMiddleware` options gain `provides` and `requires`, which make a misordered `xGuard` a load
error; `tenantGuard` without an actor answers 500. `XMiddlewareOptions` in `openapi-extensions.ts` is renamed
`XRouteProps`, the `errorResponses` export is gone and `registerAllErrorResponses` takes only the registry.

## Blast radius

Apps with an `AppError` of another status, guards listed out of order, guards of their own, or imports of the renamed
type or removed export. The OpenAPI document is unchanged. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. An `AppError` status `pnpm check` refuses: use the documented status that fits, or add it to `AppErrorStatus` with a `// fork:` note.
2. An app guard built with `xMiddleware`: declare `requires` for the actor, session or tenant it reads and `provides` for what it sets.
3. A route module that throws `[routes] <operationId> ...: <guard> reads the ...` at load: reorder its `xGuard`.

## Verify

```sh
pnpm check
pnpm test
```
