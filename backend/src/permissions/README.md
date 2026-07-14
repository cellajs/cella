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

Memberships are explicit relations (`user→context`), while ownership is an implicit relation derived from the `createdBy` field on product entities. This keeps the model simple while leaving a path to explicit relation tuples if needed.

## Configuration

### 1. Define entity hierarchy — `shared/config/hierarchy-config.ts`

The entity hierarchy is defined in `appConfig.entityConfig`:

```typescript
entityConfig: {
  user: { kind: 'user' },
  organization: { kind: 'context', ancestors: [], roles: ['admin', 'member'] },
  attachment: { kind: 'product', ancestors: ['organization'] },
  page: { kind: 'product', ancestors: [] },
} as const
```

### 2. Configure policies — `shared/config/permissions-config.ts`

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

Permission subjects carry context scope in `contextIds`, keyed by context entity type:

```typescript
const subject: SubjectForPermission = {
  entityType: 'attachment',
  id: 'att_123',
  contextIds: {
    organization: 'org_123',
  },
  createdBy: 'user_123',
};
```

Boundary code that starts from DB rows, route params, or activity events can use `buildSubject()` to normalize
column-shaped input such as `{ organizationId: 'org_123' }` into this domain shape. Permission internals should read
`subject.contextIds.organization`, not DB column names like `subject.organizationId`.

Ancestor scope is explicit:
- `undefined` means a required ancestor scope was omitted and throws `missing_scope`
- `null` means intentionally not scoped to that ancestor context
- `string` means scoped to that concrete context ID

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

1. Add the entity in `shared/config/hierarchy-config.ts`
2. Add entity type to `appConfig.entityTypes`
3. Define policies in the `configureAccessPolicies` switch (use `'own'` for ownership-scoped actions)
4. Create the module's `*-db.ts` Drizzle table and register it in `backend/src/tables.ts`
5. Pass ancestor scope through `contextIds` on permission subjects, or use `buildSubject()` when starting from
  column-shaped data (`organizationId`, `projectId`, etc.)

## Key files

| File | Purpose |
|------|---------|
| `shared/config/hierarchy-config.ts` | Entity hierarchy definition |
| `shared/config/permissions-config.ts` | Access policy definitions |
| `shared/src/permissions/permission-manager/check.ts` | Core permission check logic (incl. owner relation) |
| `shared/src/permissions/permission-manager/types.ts` | TypeScript interfaces (`SubjectForPermission`, `GrantSource`) |
| `shared/src/permissions/action-helpers.ts` | `resolvePermission()` helper for frontend |
| `shared/src/permissions/compute-can.ts` | Frontend permission map computation |