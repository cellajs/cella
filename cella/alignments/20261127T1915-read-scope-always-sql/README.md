---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# The read scope is always one SQL predicate

`buildCollectionReadWhere(filter, table, access, organizationId)` takes the organization the filter was resolved for and returns `SQL`, as does `buildChannelListReadWhere`, and the `CollectionReadWhere` union is gone. A list operation pushes the predicate into its filters without a branch. Code that returned early on `none` tests `hasNoReadScope(readFilter)`; code that read `kind === 'all'` reads `readFilter.orgWide`.

## What & why

`CollectionReadWhere` let each consumer spell out `all`, `none` and `where`, and a query that took the scope as optional read an unset one as unrestricted. The predicate is always set: an org-wide filter compiles to the table's `organizationId` equal to the organization, a filter without scopes to `false`, any other to its OR-combined scopes. `buildChannelListReadWhere` compiles an org-wide scope to `true` or the live rows: its consumer adds the organization.

## Blast radius

Every app list operation, helper or test that calls either function and reads `.kind`; the typecheck names each one. A `false` predicate answers what an early return answered: an empty page with a total of 0. No lens, no `clientCacheVersion` bump, no database change.

## Run

No script: manual.

## Manual steps

1. Each call of `buildCollectionReadWhere` passes as its fourth argument the organization id its `resolveCollectionReadFilter` call took.
2. A branch on `.kind === 'where'` pushes the predicate whole, and a test query that ran unfiltered for `all` runs `.where(predicate)`.
3. An early return on `.kind === 'none'` tests `hasNoReadScope(readFilter)`, or goes: the `false` predicate reads nothing. An early return that tested a scope the operation had widened first, for a draft or a peer read, goes: `hasNoReadScope` knows the grant scope alone and would answer that reader nothing.
4. A test of `.kind === 'all'`, such as a counter total or a widening allowed only below an org-wide read, reads `readFilter.orgWide`.
5. A `{ kind: 'all' }` built in place for a widened read compiles `buildCollectionReadWhere({ orgWide: true, scopes: [] }, table, access, organizationId)`.
6. The result of `buildChannelListReadWhere` goes into the filters whole, still ANDed with the organization.

## Verify

```sh
pnpm check
```
