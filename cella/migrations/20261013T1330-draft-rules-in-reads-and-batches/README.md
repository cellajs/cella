---
syncBreaking: true
clientCacheBump: false
---

# A draft answers a single read and a batch as its list does, and ten helper fixes

`buildZeroCounts` asks for the creator's role and `getOrganizationEntityCount` takes an `ActorContext`. `getValidChannel`
hides a draft channel from a caller its list hides it from, and `splitByPermission` applies the checks of the single
reads and answers `rejectedIds` in request order. `dispatchDeferredInvites` sends only invitations never mailed. A NUL
character answers 400. An app deletes the workarounds it carries for these.

## What & why

An app aligned its modules with the reference and found ten defects in template helpers: a batch delete reached another
author's draft, a draft channel answered by id, a product with drafts was counted as 0 under row-level security, a
publish mailed invitations twice, a NUL answered 500, a public row with a non-user mention notified nobody. Each has a
test that failed first.

## Blast radius

Sync-breaking for an app that calls `buildZeroCounts` without a role, hands `getOrganizationEntityCount` a bare
`DbContext`, or carries its own draft rule, quota wrap or publish filter. No database change, no `clientCacheVersion`
bump. `remindedAt` on a pending invitation is set from its first mail on.

## Run

No script: manual.

## Manual steps

1. `buildZeroCounts('<type>')` in a channel create: pass the role the creator's membership is inserted with, `buildZeroCounts('<type>', creatorRole)`.
2. `getOrganizationEntityCount(ctx, ...)`: the context is an `ActorContext`. Drop a `tenantRead` wrap around it: for a product that keeps drafts it opens its own on a bare connection.
3. A wrapper that adds a draft rule to `getValidChannel` (a get-one, update, publish or join of a channel that can be a draft): call `getValidChannel` and delete the wrapper. `resolveChannelCollectionReadScope` takes `ctx.var.actor.bindings` without a cast.
4. A batch delete that filters drafts or reorders `rejectedIds` after `splitByPermission`: delete the filter. A role that may delete a row it may not read no longer deletes it in a batch, as it never did by id.
5. A publish flow that picks the channels it hands to `dispatchDeferredInvites` by invitation dates: hand over every channel of the publish. The dispatch skips an invitation that carries `remindedAt`; a mail path of an app's own stamps it with `stampInactiveMembershipsReminded`.
6. An edit of `backend/src/lib/error.ts` or `tenant-guard.ts` for a NUL character: take the template's files. A NUL in an id or a written value answers 400 `invalid_request`, in a tenant id too, where an app's own test may expect 403.
7. A test that forces a server error with a NUL in a written value: call `failRequestInserts()` from `backend/tests/security/helpers` and post a request whose message starts with `failing:`.
8. `Math.max(0, ...)` around the count handed to `takeWithRestriction`, and an inner join on `users` in a `resolveRecipients` read, are redundant: the helper clamps, and the fan-out leaves out a candidate that names no user.
9. A create `onSuccess` that replaces detail-cache copies by hand: delete the call. `insertEntitiesIntoHome` puts the stored row over a cached detail.
10. Run `pnpm test:core`. `route-guards.test.ts` now fails for a route that answers a NUL character in a path parameter with a 5xx: a guard or handler that writes a path id into a header percent-encodes it.

## Verify

```sh
pnpm check
pnpm test:core
pnpm test:core:runtime
```
