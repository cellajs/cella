---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: last_seen_at, getApiIncludedMembership, adoptGeneration, getSeenChannelId
generate: true
---

# Fields every writer sets are required: Yjs and push columns, stream and catchup fields, invitation creators, actor slugs

`yjs_documents.organization_id`, `yjs_updates.organization_id` and `push_subscriptions.last_seen_at` are NOT NULL. The Yjs token claim and the materialize body require `organizationId`. A stream change requires `tenantId`, a catchup answer requires `views` and `generation`, an invitation's `createdBy` is an `ActorRef`, and `ActorRef` is a union on `kind` whose user branch has a string `slug`. App code that builds one of these with a null, or reads them through a fallback, follows.

## What & why

Each type allowed a value no writer ever leaves out, so readers carried guards and fallbacks for a case that cannot happen: `?? null`, `?.`, `x &&`, a cast past a required membership. The types now say what the data guarantees, and one boundary states each guarantee: `withCreatorRefs`, the actor-ref resolver, the worker's product message. `getSeenChannelId` takes a row with a string `organizationId`.

## Blast radius

Touches the database: two Yjs columns and one push column. Apps that never build tokens, change frames, catchup answers or actor refs by hand only regenerate. Test fixtures that pass `null` for these fields stop compiling. Bumps `clientCacheVersion`: a cached invitation list may hold a row without its creator.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it produces three `ALTER COLUMN ... SET NOT NULL` statements and a `side_effects` folder whose push retention rule reads `last_seen_at` alone. Paste `data.sql` above the push statement in the new `migration.sql`; no rename hints.
2. Fix what typecheck flags: a Yjs token, materialize body or document scope with `organizationId: null`, a `StreamChange` with `tenantId: null`, a catchup answer without `views` or `generation`, an `ActorRef` of kind `user` without a slug.
3. Drop fallbacks the types made dead: `actor.slug ?? ''` in a user branch, `createdBy?.` on an invitation, `views?.`, `generation === undefined`, `coalesce(last_seen_at, created_at)` in app SQL.
4. An app channel create whose response always carries `included.membership` (a workspace, a project) may seed it directly, as `useOrganizationCreateMutation` now does, in place of `getApiIncludedMembership`.

## Verify

```sh
pnpm generate
pnpm check
```
