# Permissions

Contextual RBAC system with hierarchical policy resolution and implicit ownership relations. Roles are scoped to context entities (not global), and product entities inherit permissions from ancestor entities. Ownership-scoped permissions allow fine-grained control over an actor's own content.

## Architecture

```
User ──membership──► Context (org) ──role──► Policy ──► Permissions
                          │                              ▲
                          ▼                              │
                    Product (attachment) ◄── inherits ───┘
                          │
                          └── createdBy ──► implicit "owner" relation
```

The design is inspired by Zanzibar (Google's authorization system). Memberships are explicit relations (`user→context`), while ownership is an implicit relation derived from the `createdBy` field on product entities. This keeps the model simple while leaving a path to explicit relation tuples if needed.

## Configuration

### 1. Define entity hierarchy (`config/default.ts`)

The entity hierarchy is defined in `appConfig.entityConfig`:

```typescript
entityConfig: {
  user: { kind: 'user' },
  organization: { kind: 'context', ancestors: [], roles: ['admin', 'member'] },
  attachment: { kind: 'product', ancestors: ['organization'] },
  page: { kind: 'product', ancestors: [] },
} as const
```

### 2. Configure policies (`permissions-config.ts`)

```typescript
export const accessPolicies = configureAccessPolicies(entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      break;
  }
});
```

Permission values:
- `1` = allowed (unconditional)
- `0` = denied
- `'own'` = allowed only when the actor is the entity's creator (implicit "owner" relation). The engine checks `entity.createdBy === userId`.

## Permission check flow

`getAllDecisions(policies, memberships, subject, options)` returns a `PermissionDecision`:

1. **Resolve contexts**: Product entities check ancestor contexts; context entities check self + ancestors
2. **Find memberships**: Match user's memberships to the subject's context IDs
3. **Apply policies**: Look up permissions for each `(contextType, role)` pair
4. **Evaluate grants**:
   - `1` → unconditional grant (attributed to the membership)
   - `'own'` → conditional grant, checks `subject.createdBy === options.userId` (attributed as `relation:owner`)
   - `0` → denied
5. **Aggregate**: Any grant (membership or relation) enables the action

The `options.userId` parameter is required when evaluating policies that use `'own'`. Backend permission helpers (`getValidProductEntity`, `splitByPermission`) automatically extract the user ID from the request context.

### Result structure

```typescript
// Grant attribution — tracks *why* an action was allowed
type GrantSource =
  | { type: 'membership'; contextType: ContextEntityType; contextId: string; role: string }
  | { type: 'relation'; relation: 'owner' };

interface PermissionDecision {
  can: Record<EntityActionType, boolean>;  // Simple permission map
  membership: Membership | null;           // First matching membership
  actions: Record<EntityActionType, {      // Detailed attribution
    enabled: boolean;
    grantedBy: GrantSource[];
  }>;
}
```

### Frontend resolution

On the frontend, `computeCan()` produces a three-state map: `true | false | 'own'`. The `'own'` value must be resolved per-entity using `resolvePermission(permission, entity.createdBy?.id, userId)` from `shared`. This allows the UI to show/hide controls based on ownership.

## Adding a new entity

1. Add to `entityConfig` in `config/default.ts`
2. Add entity type to `appConfig.entityTypes`
3. Define policies in the `configureAccessPolicies` switch (use `'own'` for ownership-scoped actions)
4. Create DB schema in `backend/src/db/schema/`

## Key files

| File | Purpose |
|------|---------|
| `config/default.ts` | Entity hierarchy definition (entityConfig) |
| `permissions-config.ts` | Access policy definitions |
| `permission-manager/check.ts` | Core permission check logic (incl. owner relation) |
| `permission-manager/types.ts` | TypeScript interfaces (`SubjectForPermission`, `GrantSource`) |
| `shared/src/permissions/action-helpers.ts` | `resolvePermission()` helper for frontend |
| `shared/src/permissions/compute-can.ts` | Frontend permission map computation |