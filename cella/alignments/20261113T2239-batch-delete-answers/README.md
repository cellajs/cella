---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: batchDeleteUsers, deleteRequests, removePushSubscription
---

# Batch deletes report every undeleted id, and push ~remove answers 204

A client of `batchDeleteUsers` reads an all-unknown batch from `rejectedIds` in a 200, no longer a 404. A client of
`batchDeleteRequests` finds unknown ids in `rejectedIds`, and one of `removePushSubscription` gets a 204 without the
`deleted` count.

## What & why

Hard deletes answered three ways. A batch delete now answers 200 with every id it did not delete in `rejectedIds` and
never 404 (`deleteUsersOp`, `deleteRequestsOp`, which reads the deleted ids back). Push `~remove` is a documented no-op
for an unknown or foreign endpoint, so it answers 204 always and `removePushSubscriptionResponseSchema` is gone. Single
deletes keep 204 and 404.

## Blast radius

Apps whose own code or tests expect a 404 from `batchDeleteUsers`, an empty `rejectedIds` from `batchDeleteRequests`,
or a `deleted` count from push `~remove`. The template's frontend reads none of them. No schema or cache change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`, then replace any check for a 404 from `batchDeleteUsers` with a check of `rejectedIds`.
2. Drop any read of `deleted` from the `removePushSubscription` response, and any import of `removePushSubscriptionResponseSchema`.

## Verify

```sh
pnpm check
```

Read the app's own callers and tests of the three operations by hand: the compiler sees a status change in none.
