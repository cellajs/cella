---
syncBreaking: false
clientCacheBump: true
grep: clientCacheVersion
---

# Clients refetch after the notification query and system user body change

Upstream bumped `appConfig.clientCacheVersion` to `v20-notification-query`, so every client clears its cached
query data on the next load and keeps its queued mutations. An app that sets its own `clientCacheVersion` bumps it too.

## What & why

`GET /notifications` reads `unread` through the shared boolean query schema and `before` as an ISO timestamp, and
`PUT /system/{id}` no longer takes `contrast`. The spec diff counts as breaking, so the cache version moves with it.

## Blast radius

Not sync-breaking: app code keeps compiling and working. Only an app that overrides `clientCacheVersion` has a step.
No database or lens change.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm check
```
