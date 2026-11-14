---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: devicesPerUser, expirationTime
generate: true
---

# Rows nothing swept go nightly, and per-user caps leave retention

Every app moves `retention.devicesPerUser` to a top-level `maxDevicesPerUser`, adds `maxPushSubscriptionsPerUser` and
`retention.apiKeyDaysAfterEnd` to `shared/config/config.default.ts`, and runs `pnpm generate`, which drops
`push_subscriptions.expiration_time`.

## What & why

API keys, passkey challenges and the counters of removed channels and products were never deleted. `apply_retention()`
now sweeps them, trims push subscriptions to `maxPushSubscriptionsPerUser` as it trims devices, and ages a revoked
session from `revoked_at`. The upsert-time trim in `upsertPushSubscription` and the challenge cleanup in
`deleteStalePasskeyChallenges` are gone. Nothing read the browser's `expirationTime`.

## Blast radius

Every app for the config keys and the column drop. An app that reads `expirationTime` or the removed helper fails to
compile. Push subscriptions beyond the cap now stay until the nightly run. No wire change: the subscribe body still
accepts the browser's `expirationTime` and drops it.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, remove `devicesPerUser` from `retention`, add `apiKeyDaysAfterEnd: 30` there, and add `maxDevicesPerUser: 50` and `maxPushSubscriptionsPerUser: 20` beside `maxSessionsPerUser`.
2. Run `pnpm generate`: it drops `push_subscriptions.expiration_time` and writes the side-effect migration with the new sweep rules. `hints.json` is empty and `data.sql` holds no statement.
3. The first run deletes API keys revoked or expired more than `apiKeyDaysAfterEnd` ago: an app that shows ended keys to their owners raises the period first.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
