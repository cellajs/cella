---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: getByChannel, createStreamDispatcher, modules/entities/stream'
---

# The app stream routes subscribers by topic

A stream subscriber's routing key is `topic` (was `channel`), the manager reads it with `getByTopic` (was
`getByChannel`), and `dispatchToAppStream` is a plain function (`createStreamDispatcher` is gone). The
`entities/stream` barrel is removed: import from the module files.

## What & why

`channel` names channel entities only, so the in-process key of `streamSubscriberManager` is a `topic`, built with
`userTopic` and `organizationTopic`. The `user:` and `org:` strings, the SSE events and `StreamNotification` are
unchanged. The dispatcher factory bound no shared state, so it became a function.

## Blast radius

Breaking for app-owned code that builds a subscriber or reads the manager (projectcampus
`entities/stream/dispatch-mirror-app.test.ts`) or imports the barrel; template files arrive with the upgrade. No
database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Rename a subscriber's `channel:` to `topic:` and `getByChannel(` to `getByTopic(` in app-owned code.
2. Replace imports from `#/modules/entities/stream` with the file that exports the name.

## Verify

```sh
pnpm check
```
