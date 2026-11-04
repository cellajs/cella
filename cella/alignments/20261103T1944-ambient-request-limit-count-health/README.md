---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: limiterScope, chargeLimiter, openBucket, inMemoryBlock, restoreDebt, validateRouteExamples, errorPagePath, buildMcpSelfComponent, rollupStatus
---

# One ambient request, one limit count, one health rollup

`limiterScope` is gone: `chargeLimiter` reads the request `runWithLogContext` binds. A `limit` limiter counts through `reserveAttempt`, so `openBucket`, `restoreDebt` and the `inMemoryBlock` option of `getRateLimiterInstance` are gone, and its `blockDuration` no longer applies. `AppError`'s `meta.errorPagePath` is gone, `rollupStatus` takes the components alone, and `/health?depth=full` answers 503 when any component is unhealthy. The boot check that refused a route response example equal to its schema's (`validateRouteExamples`) is gone, and `getPgBoss` returns the process's one instance to any role, where the `roleRank` guard refused a role above the first caller's.

## What & why

Each removed piece kept a second copy of one fact: a second AsyncLocalStorage for the request, a second counting path into `rate_limits`, a critical-component cap that only hid an unhealthy worker from the full health answer, a constant mcp self component. A duplicate route example changes the generated document nowhere, and every process starts pg-boss in one role. A monitor that reads `/health?depth=full` and expects a 200 now gets a 503 while any component is unhealthy; the deploy-status workflow reads the version from the shallow endpoint's `X-App-Version` header. An app `limit` limiter's `blockDuration` is ignored with no error. A refused `limit` request now counts nothing, and debt from the in-process fast path is counted on a refusal too.

## Blast radius

Breaking for app code that mounts `limiterScope`, passes `inMemoryBlock` or `meta.errorPagePath`, or calls `rollupStatus` with a set. No database, lens or cache-version change.

## Run

No script: manual.

## Manual steps

1. An app listener that charges a limiter from a library hook installs `app.use((ctx, next) => runWithLogContext(ctx, next))` where it mounted `limiterScope`.
2. Drop `inMemoryBlock` from `getRateLimiterInstance` calls. An app `limit` limiter with a `blockDuration` refuses until its window ends: drop the key, or move it to a fail mode if it needs a block.
3. An `AppError` thrown with `meta.errorPagePath` sets `ctx.set('errorPagePath', …)` before it throws. `ctx.var.errorPagePath` stays.
4. A test or monitor that expects 200 from the API's `/health?depth=full` while a worker is down reads the 503 and its body.

## Verify

```sh
pnpm check
```
