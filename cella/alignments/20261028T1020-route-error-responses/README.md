---
breaking: true
clientCacheBump: true
caughtBy: tests
grep: errorResponseRefs, xMiddleware, setMiddlewareExtension, createXRoutes
---

# Routes document the error statuses they answer with

`createXRoute` documents on each route the error statuses its guards, limiters, switch and request answer with, and a
route spreads `errors(404, 409)` from `#/core/x-routes` into `responses` for what its handler throws. An app guard,
limiter or lock built with `xMiddleware` declares its statuses in `errors`; in tests, an undocumented status answers a
500 that names the route and the fix.

## What & why

Every route listed the same six errors; now each lists the ones it answers with, and a status without an owner fails
in tests. `errorResponseRefs` is gone: the shared responses are `sharedErrorResponses`, Zod-backed, folded into `$ref`s
in the document. 413 is documented on every route with a body, so `AppErrorStatus` no longer lists it apart.

## Blast radius

Apps with routes of their own (every product module), guards, limiters or locks built with `xMiddleware`, or imports
of `errorResponseRefs`. The OpenAPI document and the SDK change for every operation. `clientCacheVersion` is bumped
(`v25-route-errors`): the gate reads `checkSlug`'s 409 losing its documented JSON body as a wire change, though the
handler always answered without one. No database or lens change.

## Run

No script: manual.

## Manual steps

1. An import of `errorResponseRefs`: a route spreading it drops the spread; anything else reads `sharedErrorResponses` from `#/schemas`.
2. An app guard, limiter or lock built with `xMiddleware` or `setMiddlewareExtension`: declare the statuses it throws in `errors` (a guard that answers 401: `errors: [401]`).
3. Each app route: spread `...errors(<statuses>)` for what its handler and the operations it calls throw below 500, beyond what its guards, limiters, switch and request document (`chainErrors` in `backend/src/core/x-routes.ts`); never the database's 409 `write_conflict`, documented once. A test that answers 500 with `<operationId> answered <status>, which its route does not document` names a missing one; a route module that throws `errors(<status>) repeats the <status> that <guard> answers with` at load names a redundant one.
4. Run `pnpm sdk`: the SDK's per-operation error types follow.

## Verify

```sh
pnpm sdk
pnpm test
pnpm check
```
