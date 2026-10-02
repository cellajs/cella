---
syncBreaking: true
clientCacheBump: false
---

# Error bodies carry one request id

The ApiError body drops logId: requestId is the single id, equal to the X-Request-Id response header
and the requestId on every log line of the request. The server generates it for every request and
ignores an incoming X-Request-Id; the request span records it as http.response.header.x-request-id
and log lines keep the trace id as trace_id. The frontend ApiError exposes requestId, and the error
toast and details panel label it with c:request_id. Apps rename their own logId reads to requestId.

## What & why

`logId` is gone from the `ApiError` body. `requestId` is the one id a user quotes: the same value as the `X-Request-Id` response header and the `requestId` on every log line of the request. The server always generates it and ignores an incoming `X-Request-Id`. The request span records it as `http.response.header.x-request-id`; log lines keep the trace id as `trace_id`.

## Blast radius

Apps whose own code reads `logId` from an `ApiError` or the SDK type; TypeScript reports each one. A client that sent its own `X-Request-Id` gets a server id back. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Replace `error.logId` with `error.requestId`, and a hardcoded "Log ID" label with `t('c:request_id')`.

## Verify

```sh
pnpm sdk
pnpm check
```
