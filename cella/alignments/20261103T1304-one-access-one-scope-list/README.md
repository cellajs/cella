---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: canCreateEntity, setMiddlewareExtension, #/permissions', #/permissions/build-subject, #/permissions/check-access, actorFrom, PredicateActor, ForPolicies, elevatedGrants:, homeChannelIds, conditionalScopes, intermediateScopes, homeScopes, grantedBy, BatchPermissionResult, onInvalidMembership, var.userId, var.sessionId, withRlsTx, app.user_id
---

# One access, one read-scope list, the engine answers `can`

App code imports `checkAccess`, `checkAccessBatch`, `checkAccessFanout`, `buildSubject` and `buildSubjectFromEntity` from `shared`, and `getValidChannel` from `#/permissions/get-valid-channel`. Every read scope takes `accessFrom(ctx)` where it took the bindings plus `actorFrom(ctx)`: `resolveCollectionReadFilter`, `buildCollectionReadWhere(filter, table, access)`, `resolveChannelCollectionReadScope`, `draftChannelVisibleTo` and `resolveViewReadStatus`. A `CollectionReadFilter` is `{ orgWide, scopes }`; code that read `homeChannelIds` reads the home-level scopes. `ctx.var.userId` and `ctx.var.sessionId` are `user.id` and `session.id`, and `withRlsTx` takes no user id.

## What & why

The engine returned grant attribution, resolved ids and a batch `decisions` map nobody read; it now returns `can` and the primary membership. `checkAccessBatch` returns the result map, `checkAccessFanout` one boolean per access and denies an unreadable membership alone. Elevation is read off the hierarchy, so the `elevatedGrants` option and the `ForPolicies` twins go: a trailing `rules` argument takes synthetic policies. Four scope shapes became one `ReadScope`. The backend wrapper layer, guard-order 500s, sysAdminGuard's IP restriction and `app.user_id` go.

## Blast radius

Every app with its own list operations, permission tests or catchup code. No wire, lens, schema or `clientCacheVersion` change. An organization-wide conditional scope now compiles with the organization column, which narrows only a query that leaves the organization out. `canCreateEntity` no longer re-validates the subject's ancestors: a hand-built create subject that got 400 is now checked at the scope the builders would have refused, so every create subject comes from `buildSubject` or `buildSubjectFromEntity`. `tenantGuard` no longer sets `ctx.var.db`: an app guard that provides `actor` sets `db` itself. An app that never customized permissions takes the template copies.

## Run

No script: manual.

## Manual steps

1. Replace `from '#/permissions'` and `from '#/permissions/build-subject'` with `from 'shared'`; `getValidChannel` comes from `#/permissions/get-valid-channel`. A test that mocked those paths mocks `shared` partially (`vi.mock('shared', async (importOriginal) => ({ ...(await importOriginal()), checkAccess: vi.fn() }))`).
2. Replace `resolveCollectionReadFilter(bindings, type, organizationId, actorFrom(ctx), requested)` with `resolveCollectionReadFilter(accessFrom(ctx), type, organizationId, requested)`, `buildCollectionReadWhere(filter, table, type, actor)` with `buildCollectionReadWhere(filter, table, access)`, and likewise for `resolveChannelCollectionReadScope`, `draftChannelVisibleTo` and `resolveViewReadStatus`. A helper that took memberships plus a `PredicateActor` takes an `Access<ActorBinding>`.
3. Where code read `homeChannelIds`, use `filter.orgWide ? undefined : filter.scopes.filter((scope) => scope.channelType === parentType && !scope.condition && !scope.deeperChannels).flatMap((scope) => scope.channelIds)`, with `parentType` the product's parent channel type.
4. `const { results } = checkAccessBatch(...)` becomes `const results = checkAccessBatch(...)`; a fan-out caller reads `checkAccessFanout(accesses, action, subject)[i]` and passes no options.
5. Replace `ctx.var.userId` with `ctx.var.user.id`, `ctx.var.sessionId` with `ctx.var.session.id`, and `withRlsTx(tenantId, userId, fn)` with `withRlsTx(tenantId, fn)`.
6. An app middleware marked with `setMiddlewareExtension`, which is no longer exported, is written with `xMiddleware`.
7. In app tests, a `...ForPolicies({ ... })` call becomes the bound function with a trailing `{ policies, publicGrants, hierarchy }`. Pass `publicGrants: {}` where the call passed none (the bound function reads the app's grants), and declare every role elevated on a synthetic hierarchy that declared no `elevated` (the old call let every grant reach the whole subtree; `deepSubtreeHierarchy` in the shared testing helpers does this). An assertion on `grantedBy`, `.actions` or `.subject` moves onto `can`.

## Verify

```sh
pnpm --filter backend exec vitest run src/permissions
pnpm check
```
