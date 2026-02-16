# Permissions

Contextual RBAC system with hierarchical policy resolution. Roles are scoped to context entities (not global), and product entities inherit permissions from ancestor entities.

## Architecture

```
User ──membership──► Context (org) ──role──► Policy ──► Permissions
                          │
                          ▼
                    Product (attachment) ◄── inherits permissions
```

## Configuration

### 1. Define Entity Hierarchy (`config/default.ts`)

The entity hierarchy is defined in `appConfig.entityConfig`:

```typescript
entityConfig: {
  user: { kind: 'user' },
  organization: { kind: 'context', ancestors: [], roles: ['admin', 'member'] },
  attachment: { kind: 'product', ancestors: ['organization'] },
  page: { kind: 'product', ancestors: [] },
} as const
```

### 2. Configure Policies (`permissions-config.ts`)

```typescript
export const accessPolicies = configureAccessPolicies(entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 0, delete: 1, search: 1 });
      break;
  }
});
```

Permission values: `1` = allowed, `0` = denied.

## Permission Check Flow

`getAllDecisions(policies, memberships, subject)` returns a `PermissionDecision`:

1. **Resolve contexts**: Product entities check ancestor contexts; context entities check self + ancestors
2. **Find memberships**: Match user's memberships to the subject's context IDs
3. **Apply policies**: Look up permissions for each `(contextType, role)` pair
4. **Aggregate**: Any matching policy with `1` grants the action

### Result Structure

```typescript
interface PermissionDecision {
  can: Record<EntityActionType, boolean>;  // Simple permission map
  membership: Membership | null;           // First matching membership
  actions: Record<EntityActionType, {      // Detailed attribution
    enabled: boolean;
    grantedBy: { contextType, contextId, role }[];
  }>;
}
```

## Adding a New Entity

1. Add to `entityConfig` in `config/default.ts`
2. Add entity type to `appConfig.entityTypes`
3. Define policies in the `configureAccessPolicies` switch
4. Create DB schema in `backend/src/db/schema/`

## Key Files

| File | Purpose |
|------|---------|
| `config/default.ts` | Entity hierarchy definition (entityConfig) |
| `permissions-config.ts` | Access policy definitions |
| `permission-manager/check.ts` | Core permission check logic |
| `permission-manager/hierarchy.ts` | Entity hierarchy utilities (reads from config) |
| `permission-manager/access-policies.ts` | Policy configuration builders |
| `permission-manager/types.ts` | TypeScript interfaces |