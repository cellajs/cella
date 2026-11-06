---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: requestId, error.meta, meta?., body.message, refusalOf, ErrorResponse, application/json
---

# Error bodies are Problem Details

Every error response is RFC 9457 Problem Details, sent as `application/problem+json`: `name` is now `title`,
`message` is `detail`, `requestId` is `instance`, and each `meta` entry is a top-level member, so a frontend reads
`error.retryAfter` where it read `error.meta?.retryAfter`. `AppError` keeps its `meta` option and drops `name`; a
`meta` key may not name a member the body sets (`path`, `type`, `status` and the rest of `apiErrorSchema`). The body
no longer declares `userId` or `organizationId`, which no error ever carried.

## What & why

AEP-193 asks for Problem Details: `title` is the same for every occurrence of a type and safe to log, `detail` is
this occurrence, and every value `detail` names is a member of its own. `title` is the type's text from
`error.json`, the `name` an `AppError` had. The frontend `ApiError` maps `title` to `name` and `detail` to
`message`. Backend tests read members through `membersOf` and compare refusals with `refusalOf`.

## Blast radius

Every app with its own error reads, `AppError` throws with `name` or a colliding `meta` key, tests of error bodies,
or error responses declared by hand. No cache, lens or database change. An outside client that reads `message` or
`meta` breaks.

## Run

No script: manual.

## Manual steps

1. Frontend: read `error.<member>` for each `error.meta?.<member>`, and `error.instance` for `error.requestId`; narrow it with `typeof`, as it types as `unknown`.
2. Frontend: build a local error with `new ApiError({ status, type, title, detail })`, never `name` or `message`.
3. Backend: drop `name` from `AppError` options, and rename a `meta` key the compiler refuses (the validation hook's `path` became `field`).
4. Backend: an error response declared by hand takes `problemJsonType` from `#/schemas/error-response-schemas` as its content type.
5. Backend tests: `body.message` becomes `body.detail`, `body.requestId` becomes `body.instance`, `error.meta` becomes `membersOf(error)` and `error.meta?.x` becomes `error.x`.

## Verify

```sh
pnpm check
pnpm --filter backend test
```
