---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: ctx.var.userId, limiterScope, chargeLimiter, openBucket, inMemoryBlock, restoreDebt, validateRouteExamples, errorPagePath, buildMcpSelfComponent, rollupStatus
---

# One request user id, one ambient request, one limit count

`Env.Variables.userId` is gone: read `ctx.var.user.id`. `limiterScope` is gone: `chargeLimiter` reads the request `runWithLogContext` binds. A `limit` limiter counts through `reserveAttempt`, so `openBucket`, `restoreDebt` and the `inMemoryBlock` option of `getRateLimiterInstance` are gone, and its `blockDuration` no longer applies. `AppError`'s `meta.errorPagePath` is gone, `rollupStatus` takes the components alone, and `/health?depth=full` answers 503 when any component is unhealthy.

## What & why

Each removed piece kept a second copy of one fact: the user id beside `user.id`, a second AsyncLocalStorage for the request, a second counting path into `rate_limits`, a critical-component cap that only hid an unhealthy worker from the full health answer, a constant mcp self component. A monitor that reads `/health?depth=full` and expects a 200 now gets a 503 while any component is unhealthy; the deploy-status workflow reads the version from the shallow endpoint's `X-App-Version` header. An app `limit` limiter's `blockDuration` is ignored with no error. A refused `limit` request now counts nothing, and debt from the in-process fast path is counted on a refusal too.

## Blast radius

Breaking for app code that reads or sets `ctx.var.userId`, mounts `limiterScope`, passes `inMemoryBlock` or `meta.errorPagePath`, or calls `rollupStatus` with a set. No database, lens or cache-version change.

## Run

No script: manual.

## Manual steps

1. Replace `ctx.var.userId` and `ctx.get('userId')` with `ctx.var.user.id`, and drop `ctx.set('userId', …)`.
2. An app listener that charges a limiter from a library hook installs `app.use((ctx, next) => runWithLogContext(ctx, next))` where it mounted `limiterScope`.
3. Drop `inMemoryBlock` from `getRateLimiterInstance` calls. An app `limit` limiter with a `blockDuration` refuses until its window ends: drop the key, or move it to a fail mode if it needs a block.
4. An `AppError` thrown with `meta.errorPagePath` sets `ctx.set('errorPagePath', …)` before it throws. `ctx.var.errorPagePath` stays.
5. A test or monitor that expects 200 from the API's `/health?depth=full` while a worker is down reads the 503 and its body.

## Verify

```sh
pnpm check
```
