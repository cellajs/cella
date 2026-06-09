# Upstream proposal: entity scope policy for collection and create actions

## Summary

Raak needs one upstream abstraction in Cella to keep permission scope handling entity-agnostic across forks with deeper hierarchies.

The problem is not single-entity reads, updates, or deletes. Those already scale because Cella resolves the real row first and authorizes against the row's actual context columns.

The problem is actions that do not yet have a concrete entity row to authorize against:

- collection reads
- collection search
- create
- bulk create validation before insert

These actions currently reconstruct permission scope from request params or request body in per-module code. That works while the hierarchy is shallow and assumptions stay aligned, but it drifts in forks.

Raak exposes the drift because it configures some product entities with a deeper hierarchy than Cella's default assumptions. In Raak, `attachment` is a product under `project`, which is under `organization`. That means a collection read for attachments needs explicit project scope unless the entity contract intentionally allows org-level aggregation.

Without a shared policy for how collection and create scope should be derived, handlers and frontend sync code can make inconsistent assumptions. That is exactly the class of issue this proposal is meant to prevent upstream.

## Why Raak as a fork needs this

Raak uses Cella as a base but changes hierarchy and product behavior in ways the upstream default app may not.

In Raak:

- product entities are expected to stay entity-agnostic
- hierarchy depth matters in real handlers
- frontend sync can trigger list endpoints from shared infrastructure, not only from feature screens

That creates pressure on Cella in two ways:

1. A fork can deepen an entity hierarchy without touching every handler.
2. Shared frontend sync code can still call collection endpoints using upstream assumptions unless the scope contract is centrally declared.

So the fork requirement is not a Raak-only special case. It is a template requirement:

- Cella should let forks change hierarchy without silently breaking collection and create authorization.
- Cella should provide one declarative source of truth for scope derivation whenever there is no persisted row yet.

## Non-goal

This proposal does not try to replace single-entity authorization.

These should continue to use the existing pattern:

- resolve entity by id
- authorize against the resolved row

That means the following should stay as they are conceptually:

- single read
- single update
- single delete
- batch delete by ids
- batch update by ids

Those paths already scale better than metadata because they authorize the real entity instead of a guessed scope.

## Root issue

Today Cella has generic hierarchy-aware primitives such as:

- hierarchy config
- ancestor validation
- permission subject building
- product entity resolution

But it does not have a single shared policy for this question:

"For action X on entity Y, what context scope must be explicitly present when there is no entity row yet?"

That decision is currently spread across:

- backend handlers
- create operations
- frontend canonical query registration
- sync prefetch logic

This is where forks drift.

## Proposal

Add a shared, action-aware scope policy for non-instance actions.

Suggested shape:

```ts
type NonInstanceScopePolicy =
  | { mode: 'exact'; context: string }
  | { mode: 'aggregate'; context: string };

permissions: {
  collectionRead?: NonInstanceScopePolicy;
  create?: NonInstanceScopePolicy;
}
```

Meaning:

- `exact`: this action requires explicit scope at that context level
- `aggregate`: this action may be performed at that context level across descendants

Examples:

```ts
product('task', {
  parent: 'project',
  permissions: {
    collectionRead: { mode: 'exact', context: 'project' },
    create: { mode: 'exact', context: 'project' },
  },
})

product('label', {
  parent: 'project',
  permissions: {
    collectionRead: { mode: 'aggregate', context: 'organization' },
    create: { mode: 'exact', context: 'project' },
  },
})

product('attachment', {
  parent: 'project',
  permissions: {
    collectionRead: { mode: 'exact', context: 'project' },
    create: { mode: 'exact', context: 'project' },
  },
})
```

The exact field names can differ, but the key point should remain:

- hierarchy describes ancestry
- action-aware scope policy describes required request scope when there is no row yet

Do not infer this only from schema presence such as `projectId` in a query schema. Schema shape does not tell us whether omitted scope means "aggregate across all descendants" or "invalid request".

## Why this scales better

This avoids a false choice between:

- hardcoding entity-specific rules in handlers
- forcing the deepest ancestor for every action on every product

Not every product entity needs the same collection semantics.

Examples:

- some products may support org-level aggregate collection reads
- some products may require exact project scope
- some products may allow parentless create

The shared policy lets Cella remain a template while allowing forks to vary the entity model declaratively.

## Recommended runtime helpers

Introduce two generic backend helpers.

### 1. Build collection subject

```ts
buildCollectionSubject(entityType, source)
```

Purpose:

- derive the permission subject for collection reads and searches
- validate required scope from shared policy
- normalize omitted descendant scope to `null` only when aggregate mode allows it

Usage shape:

```ts
const query = ctx.req.valid('query');
const subject = buildCollectionSubject('attachment', {
  organizationId: ctx.var.organization.id,
  ...query,
});
canPerEntityType(ctx, 'read', subject);
```

### 2. Build create subject

```ts
buildCreateSubject(entityType, source)
```

Purpose:

- derive the permission subject for create before insert
- enforce required scope from shared policy
- avoid each create operation manually constructing a partial subject

Usage shape:

```ts
const subject = buildCreateSubject('attachment', {
  organizationId: ctx.var.organization.id,
  ...bodyItem,
});
canCreateEntity(ctx, subject);
```

## What should remain unchanged

Keep existing row-based authorization for instance actions.

Continue using row resolution for:

- `getValidProductEntity(...)`
- `splitByPermission(...)`

This means no additional shared metadata is required for:

- single read
- single update
- single delete
- bulk delete by ids
- bulk update by ids

If a future use case introduces update-by-filter or delete-by-filter, that would be a new non-instance action and should use the same policy machinery as collection read and create.

## Frontend alignment

The same shared policy should inform frontend sync and canonical query design.

Why:

- the frontend can trigger collection endpoints through shared sync infrastructure
- if sync registration assumes org-level collection while backend requires exact project scope, forks get runtime 400s

Recommended frontend rule:

- entities with `collectionRead: { mode: 'aggregate', context: 'organization' }` may register org-wide canonical sync queries
- entities with `collectionRead: { mode: 'exact', context: 'project' }` must not register org-wide canonical sync queries

This keeps backend and frontend aligned through shared config instead of copy-pasted assumptions.

## Minimal rollout path in Cella

### Phase 1: shared metadata

- extend the entity config builder to accept action-aware non-instance scope policy
- expose read helpers on the hierarchy object
- validate that configured contexts exist in the ancestor chain or valid aggregation level

### Phase 2: backend helpers

- add `buildCollectionSubject(entityType, source)`
- add `buildCreateSubject(entityType, source)`
- migrate product handlers and create operations to use them

### Phase 3: frontend helpers

- add a small shared frontend helper for canonical collection scope lookup
- update sync registration and canonical query builders to use the shared policy

### Phase 4: migrate default modules

- convert task, label, attachment, and other non-instance product routes
- remove ad hoc `projectId ?? null` logic from handlers where possible

## Testing strategy

The tests are as important as the abstraction. Without them, a fork can reintroduce drift the next time it syncs from upstream.

### 1. Shared contract tests

Add hierarchy/config tests to verify:

- each configured policy context exists
- `exact` context is in the entity's ancestor chain or valid own scope
- `aggregate` context is a valid ancestor aggregation boundary
- invalid configurations fail fast during tests

This is the first line of defense for fork changes.

### 2. Generic subject-builder tests

Add tests for the new subject builders using the actual hierarchy.

For every product entity:

- if `collectionRead` is `exact` at `project`, missing `projectId` throws `missing_scope`
- if `collectionRead` is `aggregate` at `organization`, missing `projectId` is normalized appropriately and passes
- if `create` is `exact` at `project`, missing `projectId` throws

These tests should be hierarchy-driven, not attachment-driven, so they remain valid in both upstream Cella and forks.

### 3. Representative route tests

Add a few thin route-level tests for concrete module behavior.

Examples:

- list endpoint for an exact-scope product without required scope returns 400
- same endpoint with required scope returns 200
- list endpoint for an aggregate product can still be called at aggregate scope

Only a few representative modules are needed if the generic helper tests are strong.

### 4. Frontend sync/query tests

Add tests around canonical sync query registration.

Verify:

- exact-scope products are not registered as org-wide canonical sync queries
- aggregate products may be

This catches the backend/frontend mismatch that forks are otherwise likely to hit.

## Why this belongs upstream in Cella

This is template infrastructure, not a Raak patch.

Reasons:

- forks are expected to change hierarchy and permissions
- Cella already aims to keep entity logic generic and hierarchy-driven
- the missing piece is a central policy for non-instance actions
- pushing this upstream prevents every fork from reinventing the same local fix

If kept only in Raak, future Cella syncs will keep recreating friction because the root abstraction would still be missing upstream.

## Practical success criteria

This proposal is successful when the following become true in Cella:

- a fork can deepen a product hierarchy without manually auditing every list and create handler
- frontend sync cannot accidentally call an invalid collection scope for a configured entity
- exact-scope and aggregate-scope collection semantics are both supported declaratively
- single-entity update/delete/read remain row-based and unchanged
- hierarchy-driven tests catch policy drift before it reaches runtime

## Notes for Raak

Raak should carry this upstream because it already demonstrates the failure mode:

- a product entity with deeper scope requirements
- a valid permission system that correctly rejects missing scope
- shared frontend sync logic that can still call the endpoint with broader assumptions

That makes Raak a useful proving ground for the upstream change, but the solution should live in Cella so forks inherit the abstraction instead of the bug.