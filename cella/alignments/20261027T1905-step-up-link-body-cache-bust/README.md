---
breaking: false
clientCacheBump: true
grep: clientCacheVersion
---

# Clients refetch after the step-up link route's body became required

Upstream bumped `appConfig.clientCacheVersion` to `v21-step-up-link-body`, so every client clears its cached query
data on the next load and keeps its queued mutations. An app that sets its own `clientCacheVersion` bumps it too.

## What & why

`POST /auth/step-up/link` declares its JSON body through `jsonBody`, so the body is required: a request without one is
answered 400 where it got a 204 that sent nothing. The spec diff counts as breaking, so the cache version moves with it.

## Blast radius

Not breaking: the template's frontend always sends a body. Only an app that overrides `clientCacheVersion` has a
step. No database or lens change.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm check
```
