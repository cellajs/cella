---
syncBreaking: true
clientCacheBump: false
---

# Error types say what happened, and the error toast explains it

`getErrorInfo` and `ErrorNoticeError` moved from `~/modules/common/error-helpers` to `~/utils/get-error-info`:
update the imports. Three failures left the `server_error` type: an exhausted database pool answers
`service_unavailable`, a deadlock or serialization failure `write_conflict`, and a Hono `HTTPException` below 500
`invalid_request`. `AppError`'s `message` option now wins over the type's `.text`, so check each throw of yours
that passes one. Every language beyond `en` needs the two new types in its `error.json`.

## What & why

The error toast shows the type's `.text` sentence under its title, through the `getErrorInfo` resolver the error
page uses; severity `error` adds the request id with a copy button. `server_error` covered five different
failures, so its text could say nothing: it now means the server's own fault alone. A message written at a throw
is that throw's account of what went wrong, so it reaches the log and, for a 5xx, a development client.

## Blast radius

Apps that import `getErrorInfo`, match `server_error` in code or tests, pass `message` to `AppError`, or translate
`error.json`. TypeScript reports the moved import. No database change, no `clientCacheVersion` bump. An app that
did none of these only gets toasts with an explanation.

## Run

No script: manual.

## Manual steps

1. Import `getErrorInfo` and `ErrorNoticeError` from `~/utils/get-error-info`; `handleAskForHelp` stays in `~/modules/common/error-helpers`.
2. Where code or a test expects `server_error` for a pool timeout (503), a database conflict (409) or a 4xx `HTTPException`, expect `service_unavailable`, `write_conflict` or `invalid_request`.
3. For each `new AppError(..., { message })` of your own on a type that has a `.text`: a client now reads your message on a 4xx, so drop the option where the type's text should show.
4. Add `service_unavailable`, `service_unavailable.text`, `write_conflict` and `write_conflict.text` to `locales/<lng>/error.json` of each language beyond `en`, and translate the new `server_error.text`.
5. Read your own `.text` sentences in `error.json` and `appError.json` once as a toast's second line: one that repeats its title can lose the repeated part.

## Verify

```sh
pnpm check
pnpm test
```
