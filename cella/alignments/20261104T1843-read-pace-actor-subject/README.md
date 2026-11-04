---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: syncReadLimiter, userId, blockDuration
---

# Every read is paced, a limiter's subject is the actor

`syncReadLimiter` is `readLimiter`, and `createXRoute` mounts it on every GET route that declares no limiter, so the three list routes that mounted it declare none. `userId` is no longer a rate-limit identifier: `actorId` names a signed-in user and a service account alike, and every guard sets it. A `limit` limiter with a `blockDuration` above zero is refused when its module loads. A limiter's budget reaches the OpenAPI document as `policy` under `info.x-extensions`, so its `description` says what is counted and no longer its numbers. A guard that runs a limiter itself declares it in `limiters`, and `serviceGuard` does so for the burst limiter, so every route behind it documents the limiter and its 429.

## What & why

A session had no bound on reads: 31 template GET routes carried no limiter, and one client could hold the API's event loop. A chain that started with `userId` keyed a service account by its address. The burst limiter ran inside the service guard without a line in the document, so an actor-guard route answered a 429 it did not list. Numbers in prose drift from the config they describe. The library's own cleanup timer per store instance is off: the retention sweep deletes aged rows.

## Blast radius

Breaking for app code that imports `syncReadLimiter`, keys a limiter on `userId`, or passes `blockDuration` to a `limit` limiter. An app GET route without `xRateLimiter` now answers 429 past the read pace. No database, lens or cache-version change.

## Run

No script: manual.

## Manual steps

1. Drop `syncReadLimiter` from a GET route (the default covers it); a non-GET route that mounted it takes `readLimiter`.
2. Replace `'userId'` with `'actorId'` in an app limiter's identifiers and in `subjectSegment` calls.
3. Drop `blockDuration` from an app `limit` limiter, or move the limiter to a fail mode.
4. Take the numbers out of an app limiter's `description`: the docs show its budget from its `limits`.
5. A GET route whose reads must not count against the pace declares a limiter of its own.

## Verify

```sh
pnpm check
```
