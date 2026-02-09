This document describes the architectural plan for implementing PostgreSQL Row-Level Security (RLS) based tenant isolation in Cella.

RLS is a **defense-in-depth** layer, not the primary authorization mechanism. Cella's membership-based permission manager remains the authorization layer. RLS adds database-level protection against application bugs and incorrect queries.

**References:**
- [Drizzle v1 RLS API](https://orm.drizzle.team/docs/rls)
- [Neon RLS with Drizzle guide](https://neon.com/docs/guides/rls-drizzle)

---

##  Why add RLS if we already have authorization?**

Defense-in-depth. Even with correct application code:
- A single bug in a query could expose data across tenants
- Refactoring might accidentally remove a WHERE clause
- New developers might write queries that bypass the permission checks

RLS ensures that even if the application layer fails, the database won't return or accept data from the wrong tenant. The permission manager grants access; RLS acts as a safety net.

**Policy design:**
RLS policies enforce tenant isolation and (for most tables) organization membership to prevent cross-org access within a tenant. This mirrors the application-layer authorization, providing redundant verification that the user has legitimate access to the data.

---

## Problem

Cella currently uses row-level filtering (`organizationId` column) for data scoping. All filtering happens at the application layer via `orgGuard` middleware and the permission manager. This works correctly, but lacks defense-in-depth:

- **No database-level safety net** — A bug in application code could leak data across tenants
- **Single point of failure** — Security relies entirely on correct application-layer filtering
- **No tenant abstraction** — Today organization is the isolation boundary; we add tenant as an outer boundary while preserving organization as the universal inner boundary

## Requirements

1. **Tenant as resource** — `tenant` is a resource type (ResourceType), not an entity (no `entityBase`, no CRUD routes)
2. **Denormalized tenantId** — Add `tenantId` column to organizations, memberships, product entities, activities
3. **Required tenantId** — `tenantId` is never null; forks not using multi-tenancy use a single default tenant
4. **RLS on all tenant-scoped tables** — Every table with `tenantId` has isolation policy
5. **Session variable protocol** — Every request sets `app.tenant_id` in transaction via `set_config()` (transaction-scoped)
6. **Split DB roles** — Runtime role (`runtime_role`) subject to RLS; migration uses superuser for DDL
7. **Sync engine compatibility** — CDC Worker parses `tenantId` from activities
8. **Cross-tenant queries** — Cross-tenant reads happen via `/me/*` endpoints using `app.user_id` (no tenant context required); tenant-scoped routes require explicit tenant context
9. **Tenant in URLs** — Both frontend and backend routes include `tenantId` prefix for tenant scoped routes
10. **Public content support** — Public routes use session variable `app.is_authenticated=false` with RLS policies that allow access to `is_public=true` rows; they still require tenant context from the URL

## Constraints

- **Transaction wrapping** — All tenant-scoped queries must run in transaction for `set_config(..., true)` to work
- **Admin bypass** — System admins get cross-tenant access via RLS policies checking `is_system_admin()` (not a separate connection)
- **Migration bypass** — Migrations/seeds use `migrationDb` (superuser) for DDL and role creation
- **Short tenant ID** — Lowercase `[a-z0-9]{6}` nanoid for URL-friendliness; inputs normalized to lowercase before validation and storage; collision handled at creation time

### RLS policy pattern

Tenant-scoped tables use one of the following policy patterns:

1. **Standard** (product entities) — Strict tenant-scoped CRUD for `attachments` and fork-specific product entities. All operations require valid `app.tenant_id` context.

2. **Cross-tenant read** — User-based SELECT across tenants, tenant-scoped writes. Required for Cella's flat architecture where users see all their data on page init:
   - `memberships` — SELECT filtered by `user_id`
   - `organizations` — SELECT filtered by membership EXISTS
   - `activities` — SELECT filtered by membership EXISTS

3. **RLS-exempt** (public entities) — No RLS policies. Write protection via application layer (`isAuthenticated` middleware + permission manager). Used for truly public content like `pages` where public read access is the primary use case.

**Per-table mapping:**

| Table | Policy Type | Public Access |
|-------|-------------|---------------|
| `organizations` | Cross-tenant read | None |
| `memberships` | Cross-tenant read | None |
| `activities` | Cross-tenant read | None |
| `pages` | RLS-exempt | Public by design |
| `attachments` | Standard | None |

#### Security principles

**Fail-closed enforcement:** All policies deny access when `app.tenant_id` is NULL or empty. This prevents accidental data exposure if middleware fails to set context.

**Role-based admin bypass:** Do not trust a boolean session variable (`app.is_system_admin`) as the only bypass. Use an **admin role/connection** with `BYPASSRLS` for migrations/system jobs. Admin handlers explicitly use `unsafeInternalAdminDb` — this makes dangerous paths grep-able and auditable.

**Operation-specific policies:** Instead of `FOR ALL`, use separate `FOR SELECT`, `FOR INSERT`, `FOR UPDATE`, `FOR DELETE` policies. This provides:
- Granular control over read vs write operations
- `WITH CHECK` clauses for write operations to prevent tenant boundary violations
- Clearer audit trail and easier debugging

**Explicit parentheses:** All `AND`/`OR` combinations use explicit parentheses to prevent precedence bugs.

### Composite foreign keys (franken-row prevention)

RLS policies prevent unauthorized access, but don't prevent **franken-rows** — rows where `tenant_id=A` but `organization_id` points to an org in tenant B. This can happen via:

- Handler bugs where `organizationId` comes from request params without proper validation
- Admin bypass paths (`unsafeInternalAdminDb`, seeds, migrations, CDC worker)
- Refactoring mistakes that break the relationship between tenant and org checks

**Solution:** Composite foreign keys guarantee at the database level that referenced parents belong to the same tenant. This catches integrity bugs immediately at insert time, not later via silent data corruption.

#### Which relationships need composite FKs

| Child Table | Parent Table | FK Columns | Reason |
|-------------|--------------|------------|--------|
| `memberships` | `organizations` | `(tenant_id, organization_id)` | Critical security boundary |
| `pages` | `organizations` | `(tenant_id, organization_id)` | Public content visibility |
| `attachments` | `organizations` | `(tenant_id, organization_id)` | Org-level attachments |
| `attachments` | `pages` | `(tenant_id, page_id)` | Page-level attachments |
| `activities` | `organizations` | `(tenant_id, organization_id)` | Audit trail integrity |

#### Forks with additional context entities

For forks with extra context types (e.g., `project`), composite FKs work via **transitive integrity**:

1. `memberships → organizations`: Composite FK (always, since `organizationId` is required)
2. `projects → organizations`: Composite FK on the project table
3. `memberships → projects`: Standard FK (nullable column)

The chain guarantees tenant consistency: if `projectId` is set, the project's own composite FK ensures it belongs to the correct tenant. **No composite FK needed for nullable context columns** — standard FK + transitive integrity handles it.

#### Implementation

**Step 1: Add compound unique to organizations:**

```typescript
// backend/src/db/schema/organizations.ts
export const organizationsTable = pgTable(
  'organizations',
  {
    ...contextEntityColumns('organization'),
    tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenantsTable.id),
    // ... other columns
  },
  (table) => [
    // Compound unique for composite FK targets
    unique('org_tenant_unique').on(table.tenantId, table.id),
    // ... existing indexes
  ],
);
```

**Step 2: Update product entity columns to use composite FK:**

```typescript
// backend/src/db/utils/product-entity-columns.ts
import { foreignKey } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';

// In table definition callback:
(table) => [
  // Composite FK ensures org belongs to same tenant
  foreignKey({
    columns: [table.tenantId, table.organizationId],
    foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
  }).onDelete('cascade'),
  // ... existing indexes
]
```

**Step 3: Replace polymorphic refs with typed FK columns:**

Instead of `entityId`/`entity` polymorphic columns, use explicit typed FK columns per parent type. This enables composite FKs and DB-level integrity.

```typescript
// backend/src/db/schema/attachments.ts
export const attachmentsTable = pgTable(
  'attachments',
  {
    id: varchar('id', { length: 12 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 6 }).notNull(),
    organizationId: varchar('organization_id', { length: 12 }).notNull(),
    // Typed FK columns replace entityId/entity
    pageId: varchar('page_id', { length: 12 }), // nullable - attachment may be org-level
    // ... other columns
  },
  (table) => [
    // Composite FK to organization
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    // Composite FK to page (when pageId is set)
    foreignKey({
      columns: [table.tenantId, table.pageId],
      foreignColumns: [pagesTable.tenantId, pagesTable.id],
    }).onDelete('cascade'),
  ],
);
```

**Migration from polymorphic to typed FKs:**

1. Add `pageId` column (nullable)
2. Backfill: `UPDATE attachments SET page_id = entity_id WHERE entity = 'page'`
3. Add composite FK constraint
4. Update handlers to use `pageId` instead of `entityId`/`entity`
5. Drop `entityId` and `entity` columns

**Benefits over polymorphic refs:**
- Full DB-level integrity via composite FKs (no RLS CASE logic needed)
- Cascade deletes work automatically
- No trigger needed for admin/batch paths
- Simpler queries (no CASE/EXISTS overhead)
- Type-safe at schema level

#### Protection coverage

| Relationship Type | Runtime Protection | Admin/Batch Protection |
|-------------------|-------------------|------------------------|
| `organizationId` | ✅ Composite FK | ✅ Composite FK |
| `pageId` (typed) | ✅ Composite FK | ✅ Composite FK |

All FK relationships now have full DB-level guarantees via composite FKs.

#### Migrating `uniqueKey` to native composite constraints

Cella currently uses a `uniqueKey` varchar column on `memberships` and `inactive_memberships` that concatenates values (e.g., `${userId}-${organizationId}`) to enforce uniqueness. This is an application-level workaround.

**Refactor to native composite unique constraints:**

```typescript
// Before: application-level uniqueKey
uniquKey: varchar().unique().notNull(), // value: `${userId}-${organizationId}`

// After: native composite unique constraint
(table) => [
  unique('membership_tenant_user_org').on(table.tenantId, table.userId, table.organizationId),
]
```

**Migration steps:**

1. Add native composite unique constraint to memberships/inactive_memberships
2. Update all insert logic to remove `uniqueKey` value generation
3. Drop `uniqueKey` column
4. Update handlers that reference `uniqueKey` in conflict handling

**Benefits:**
- DB-native enforcement (can't be bypassed by application bugs)
- Includes `tenantId` in uniqueness check automatically
- Cleaner schema — no concatenated string column
- Can be used as composite FK target if needed

#### Standard strict policy (product entities)

For product entities that are only accessed within a specific organization context. These use **membership-verified** tenant-scoped CRUD — SELECT requires not just tenant context but also membership in the organization:

```typescript
// Example: attachments table with membership-verified policy
// Uses typed FK columns (pageId) instead of polymorphic entityId/entity
export const attachments = pgTable('attachments', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 12 }).notNull(),
  pageId: varchar('page_id', { length: 12 }), // typed FK, nullable
  // ... other columns
}, (t) => [
  // Composite FKs in table callback (see "Composite foreign keys" section)
  // SELECT requires membership in the organization
  pgPolicy('tenant_select_policy', {
    for: 'select',
    using: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
      AND ${membershipExists(t)}
    `,
  }),
  // INSERT requires membership in the target organization
  pgPolicy('tenant_insert_policy', {
    for: 'insert',
    withCheck: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
      AND ${membershipExists(t)}
    `,
  }),
  // UPDATE requires membership on both old and new row values
  // WITH CHECK validates the NEW row: prevents moving records to orgs user can't access
  pgPolicy('tenant_update_policy', {
    for: 'update',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated} AND ${membershipExists(t)}`,
    withCheck: sql`${tenantMatch(t)} AND ${isAuthenticated} AND ${membershipExists(t)}`,
  }),
  // DELETE requires membership
  pgPolicy('tenant_delete_policy', {
    for: 'delete',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated} AND ${membershipExists(t)}`,
  }),
]);
```

#### RLS-exempt entities (public content)

Entities designed for public access (e.g., `pages`) are exempt from RLS entirely:

- **No RLS policies** — Public content is publicly readable
- **No `organizationId`** — Only `tenantId` for URL routing
- **Write protection** — Application layer via `isAuthenticated` middleware + permission manager
- **Benefits**: Simpler schema, no awkward org relationship, cleaner public URLs
- **Trade-off**: No database-level defense-in-depth for writes (permission manager is primary auth)

```typescript
// Example: pages table - RLS-exempt public entity
export const pagesTable = pgTable('pages', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  // No organizationId - public entity, tenant-scoped only
  status: varchar({ enum: ['unpublished', 'published', 'archived'] }).notNull(),
  // ... other columns
}, (table) => [
  index('pages_tenant_id_idx').on(table.tenantId),
  // No RLS policies - public entity
]);
```

### Database roles

Three database roles with distinct privileges:

| Role | Privileges | RLS Behavior | Use Case |
|------|------------|--------------|----------|
| `runtime_role` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables (except activities) | Subject to RLS policies | All requests (authenticated and public) |
| `cdc_role` | `REPLICATION`, `INSERT` on activities, `SELECT/INSERT/UPDATE` on counters | N/A (activities, counters have no RLS) | CDC Worker append-only writes + sequence tracking |
| `admin_role` | Table ownership, `BYPASSRLS` | Skips RLS | Ensures FORCE RLS applies to runtime_role |

> **Note:** Superuser (`postgres`) is used for migrations via `migrationDb`. The `admin_role` exists to own tables (required for `FORCE ROW LEVEL SECURITY` to apply to other roles).

**Configuration:**

```typescript
// backend/.env.example
DATABASE_URL=postgres://runtime_role:password@host/db     // Runtime (RLS enforced)
DATABASE_ADMIN_URL=postgres://postgres:password@host/db    // Migrations only (superuser)
```

**Public route handling:**

Public routes use the same `db` connection but set different session variables:

```typescript
// withPublicTenantContext sets:
SET LOCAL app.tenant_id = 'abc123';
SET LOCAL app.is_authenticated = 'false';
SET LOCAL app.user_id = '';
```

RLS policies then allow access only to rows where `is_public = true`:

```sql
-- Example: pages SELECT policy allows public access to is_public=true rows
CREATE POLICY pages_select_policy ON pages FOR SELECT USING (
  tenant_id = current_setting('app.tenant_id', true)
  AND (
    (current_setting('app.is_authenticated', true)::boolean = true AND membership_exists)
    OR is_public = true  -- Public visitors see only public rows
  )
);
```

**Why session-variable approach (not separate role):**
- Single connection pool (simpler, faster)
- Works identically in PGlite and Postgres
- Security enforced by RLS policies, not role grants
- Easier to reason about and test

**Important:** Public routes must still set `app.tenant_id` via `hasPublicTenantAccess` middleware. Policies filter by `current_setting('app.tenant_id')`, so queries without tenant context return no rows (fail-closed).

**Policy summary:**

| Entity Type | SELECT | INSERT/UPDATE/DELETE |
|-------------|--------|----------------------|
| Context entities (`organizations`) | Cross-tenant (via membership EXISTS) | Tenant-scoped |
| `memberships` | Cross-tenant (own) OR tenant-scoped (org members) | Tenant-scoped |
| `activities` | App-layer (no RLS) | Privilege revoked (CDC only) |
| Product entities (`attachments`) | Tenant-scoped + membership | Tenant-scoped + membership |
| Public entities (`pages`) | No RLS (app-layer) | No RLS (app-layer via `isAuthenticated`) |

- Missing tenant context on writes: **denied** (fail-closed)
- Missing both contexts on reads: **denied** (via restrictive guard on memberships)
- Admin bypass: use `unsafeInternalAdminDb` connection (not session variable)
- Activities: append-only via CDC, runtime has SELECT only

#### Cross-tenant read policy (context entities, memberships, activities)

Due to Cella's flat architecture, users need to see their organizations, memberships, and activities across **all tenants** on page init (for menu/navigation and sync). These entities need cross-tenant **read** access, but writes must remain tenant-scoped.

**Memberships** — Two access patterns:
1. **Own memberships** (cross-tenant): User sees all their own memberships via `/me/memberships`
2. **Org members** (tenant-scoped): Org members can list other members via `/:tenantId/:orgId/members`

```typescript
export const memberships = pgTable('memberships', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 12 }).notNull().references(() => users.id),
  organizationId: varchar('organization_id', { length: 12 }).notNull().references(() => organizations.id),
  // ... other columns
}, (t) => [
  // RESTRICTIVE guard: at least one context var must be set (defense-in-depth)
  pgPolicy('memberships_context_guard', {
    as: 'restrictive',
    for: 'select',
    using: sql`${tenantContextSet} OR ${userContextSet}`,
  }),
  // SELECT: Own memberships (cross-tenant) OR org members (tenant-scoped)
  pgPolicy('memberships_select_policy', {
    for: 'select',
    using: sql`
      ${isAuthenticated}
      AND (
        ${userMatch(t)}
        OR (${tenantMatch(t)} AND ${membershipExists(t)})
      )
    `,
  }),
  // INSERT/UPDATE/DELETE: Strictly tenant-scoped
  pgPolicy('memberships_insert_policy', {
    for: 'insert',
    withCheck: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
  pgPolicy('memberships_update_policy', {
    for: 'update',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
    withCheck: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
  pgPolicy('memberships_delete_policy', {
    for: 'delete',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
]);
```

**Immutability trigger for key fields:**

Memberships need UPDATE (to change `role`, `archived`, etc.), but identity columns must never change. RLS can't enforce "old value = new value" directly, so use a trigger:

```sql
-- Prevent changing identity columns on memberships
CREATE FUNCTION memberships_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id != OLD.tenant_id 
     OR NEW.organization_id != OLD.organization_id 
     OR NEW.user_id != OLD.user_id THEN
    RAISE EXCEPTION 'Cannot modify tenant_id, organization_id, or user_id on memberships';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memberships_immutable_keys_trigger
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION memberships_immutable_keys();
```

This protects against bugs even if someone later adds a sloppy policy or uses admin bypass.

**Organizations** — User sees all orgs they're a member of (requires join to memberships):

```typescript
export const organizations = pgTable('organizations', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  // ... other columns
}, (t) => [
  // SELECT: User can see orgs where they have membership (cross-tenant)
  // Includes tenant match in EXISTS for defense against data corruption
  pgPolicy('organizations_select_policy', {
    for: 'select',
    using: sql`
      ${isAuthenticated}
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.organization_id = ${t.id}
        AND m.user_id = current_setting('app.user_id', true)::text
        AND m.tenant_id = ${t.tenantId}
      )
    `,
  }),
  // INSERT/UPDATE/DELETE: Strictly tenant-scoped
  pgPolicy('organizations_insert_policy', {
    for: 'insert',
    withCheck: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
  pgPolicy('organizations_update_policy', {
    for: 'update',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
    withCheck: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
  pgPolicy('organizations_delete_policy', {
    for: 'delete',
    using: sql`${tenantMatch(t)} AND ${isAuthenticated}`,
  }),
]);
```

**Activities** — Privilege-based protection (no RLS):

Activities is an append-only audit log written exclusively by CDC Worker. Instead of RLS, we use privilege-based protection with a dedicated CDC role:

```sql
-- Create minimal CDC role (no BYPASSRLS needed)
CREATE ROLE cdc_role WITH LOGIN REPLICATION PASSWORD '...';

-- CDC can only INSERT activities (append-only)
GRANT INSERT ON activities TO cdc_role;
-- CDC needs counters for sequence tracking
GRANT SELECT, INSERT, UPDATE ON counters TO cdc_role;
-- No SELECT, UPDATE, DELETE on activities - true append-only

-- Runtime can only SELECT (app-layer filters by membership)
GRANT SELECT ON activities TO runtime_role;
-- No INSERT, UPDATE, DELETE for runtime

-- No RLS policies on activities table
```

**Why privilege-based instead of RLS:**

| Concern | RLS Value | Privilege-Based |
|---------|-----------|----------------|
| Write protection | ❌ None (CDC bypasses anyway) | ✅ Runtime can't write at all |
| Modification protection | ❌ CDC bypasses | ✅ Append-only enforced (no UPDATE/DELETE) |
| Read protection | ⚠️ Redundant with app | ⚠️ Same (app-layer) |
| Performance | ❌ membership EXISTS on large table | ✅ No overhead |
| Blast radius | ❌ Admin can do anything | ✅ CDC can only append to activities |

**Access pattern:**
- CDC Worker → `cdcDb` (cdc_role with REPLICATION + INSERT activities + counters access)
- App runtime → `runtime_role` for SELECT only (app filters by membership)
- No UPDATE/DELETE on activities ever (append-only audit log)

**CDC Worker connection:**

```typescript
// cdc/src/db.ts
export const cdcDb = drizzle({ connectionString: env.DATABASE_CDC_URL });

// Insert activity (only operation CDC can do on activities)
await cdcDb.insert(activitiesTable).values(activity);

// Increment sequence counter
await cdcDb.insert(countersTable).values(...).onConflictDoUpdate(...);
```

The composite FK `(tenant_id, organization_id) → organizations(tenant_id, id)` still prevents franken-rows on INSERT.

### Fork considerations: nested context entities

Forks may add nested context entities beyond `organization`. For example:

```typescript
// Raak hierarchy example
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: ['admin', 'member'] })
  .context('workspace', { parent: 'organization', roles: roles.all })
  .context('project', { parent: 'organization', roles: roles.all })
  .product('task', { parent: 'project' })
  .product('label', { parent: 'project' })
  .product('attachment', { parent: 'project' })
  .product('page', { parent: null })
  .build();
```

**RLS enforces tenant + organization boundaries only — always.**

This is a deliberate architectural decision, not a limitation. The database enforces exactly two boundaries:

1. **Tenant boundary** — No cross-tenant access
2. **Organization boundary** — No cross-organization access within a tenant

| Layer | Scope | Enforcement |
|-------|-------|-------------|
| RLS (Database) | Tenant + Organization | Hard boundary — DB denies cross-tenant/cross-org access |
| Permission Manager (Application) | Project, Workspace, Task-level | Primary authorization — app-layer checks |

A bug in project-level permission checks might leak data to the wrong project **within the same organization**. RLS does not catch this — the data stays within the organization boundary.

A bug that leaks data across organizations or tenants? RLS catches it.

**Why organization-level only (not project/workspace)?**

1. **Universal compatibility** — Every fork has organizations. Not every fork has projects or workspaces.

2. **Complexity vs. benefit** — Project-level RLS requires role-aware membership EXISTS with OR conditions for admin inheritance. Policies become harder to audit and maintain.

3. **Performance** — More complex EXISTS checks with role hierarchy traversal add query overhead.

4. **Schema coupling** — RLS policies would need to understand role inheritance (`admin` sees all, `member` sees own context), coupling DB to application authorization logic.

5. **Defense-in-depth principle** — RLS is a safety net, not primary authorization. Organization boundary catches the most severe bugs (multi-tenant SaaS data leaks).

---

### Fork contract: universal RLS compatibility

To guarantee RLS works correctly for **any** fork entity hierarchy, all forks must follow these rules:

#### The universal rule

> **Every tenant-scoped table must have `tenant_id` and `organization_id` as required columns, with a composite FK to `organizations(tenant_id, id)`.**

This single rule makes the design compatible with any entity hierarchy because it reduces the DB's job to enforcing the one boundary every fork shares: tenant + organization.

#### Required schema pattern for all tenant-scoped tables

```typescript
// ANY tenant-scoped table (context or product entity)
export const someTable = pgTable('some_table', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull(),
  organizationId: varchar('organization_id', { length: 12 }).notNull(),
  // ... other columns (projectId, workspaceId, etc. are optional)
}, (table) => [
  // MANDATORY: Composite FK to organization
  foreignKey({
    columns: [table.tenantId, table.organizationId],
    foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
  }).onDelete('cascade'),
  // OPTIONAL: Additional composite FKs to immediate parent (project, workspace, etc.)
]);
```

#### Fork checklist

When adding a new table to a fork, determine its scope:

| Table Type | Required Columns | Composite FK | RLS Pattern |
|------------|------------------|--------------|-------------|
| **Org-scoped** (most tables) | `tenant_id`, `organization_id` | `→ organizations(tenant_id, id)` | Tenant + org membership |
| **Tenant-only** (rare: billing, tenant settings) | `tenant_id` | None | Tenant-only |
| **Global** (users, sessions) | None | None | No RLS or user-based |

**Org-scoped tables** (the common case):
- [ ] Add `tenant_id: varchar('tenant_id', { length: 6 }).notNull()`
- [ ] Add `organization_id: varchar('organization_id', { length: 12 }).notNull()`
- [ ] Add composite FK: `(tenant_id, organization_id) → organizations(tenant_id, id)`
- [ ] Add RLS policies using `tenantMatch(t)` + `membershipExists(t)`
- [ ] If table has parent context (project, workspace), add second composite FK to parent

**Tenant-only tables** (rare — use sparingly):
- [ ] Add `tenant_id: varchar('tenant_id', { length: 6 }).notNull()`
- [ ] Add RLS policies using `tenantMatch(t)` only (no membership check)
- [ ] Document why this table doesn't need organization scope
- [ ] Ensure table cannot be joined to org-scoped data without going through org

**Examples by table type:**

| Table | Type | Has `organization_id` | Why |
|-------|------|----------------------|-----|
| `organizations` | Context | ✅ (is the org) | Root context entity |
| `memberships` | System | ✅ | Links users to orgs |
| `projects` | Nested context | ✅ | Belongs to org, has composite FK |
| `workspaces` | Nested context | ✅ | Belongs to org, has composite FK |
| `tasks` | Product entity | ✅ | Denormalized from project.organizationId |
| `attachments` | Product entity | ✅ | Always org-scoped |
| `pages` | Product entity | ✅ | Always org-scoped |
| `activities` | Audit | ✅ | All activities are org-scoped |
| `tenant_settings` | Tenant-only | ❌ | Tenant-level config, no org |
| `billing_subscriptions` | Tenant-only | ❌ | Billing is per-tenant |

#### Nested context entities (projects, workspaces)

Nested contexts like `projects` or `workspaces` must include both `tenant_id` and `organization_id`:

```typescript
// projects table — nested under organization
export const projectsTable = pgTable('projects', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull(),
  organizationId: varchar('organization_id', { length: 12 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  // ... other columns
}, (table) => [
  // Composite FK to organization (mandatory)
  foreignKey({
    columns: [table.tenantId, table.organizationId],
    foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
  }).onDelete('cascade'),
  // Compound unique for composite FK targets (if children reference this table)
  unique('project_tenant_unique').on(table.tenantId, table.id),
]);
```

#### Product entities with nested parent

Product entities under nested contexts (e.g., `tasks` under `project`) must still have `organization_id`:

```typescript
// tasks table — parent is project, but still has organization_id
export const tasksTable = pgTable('tasks', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull(),
  organizationId: varchar('organization_id', { length: 12 }).notNull(), // REQUIRED
  projectId: varchar('project_id', { length: 12 }).notNull(),
  // ... other columns
}, (table) => [
  // Composite FK to organization (mandatory for RLS)
  foreignKey({
    columns: [table.tenantId, table.organizationId],
    foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
  }).onDelete('cascade'),
  // Composite FK to project (for immediate parent integrity)
  foreignKey({
    columns: [table.tenantId, table.projectId],
    foreignColumns: [projectsTable.tenantId, projectsTable.id],
  }).onDelete('cascade'),
]);
```

The `organizationId` is denormalized from the project — handlers must copy it when creating tasks. This enables RLS to work without understanding the project→org relationship.

#### What this guarantees

By following the fork contract:

1. **No cross-tenant access** — RLS policy checks `tenant_id = current_setting('app.tenant_id')`
2. **No cross-organization access** — RLS policy checks membership in `organization_id`
3. **No franken-rows** — Composite FK prevents `organization_id` pointing to org in different tenant
4. **Any entity hierarchy works** — Forks can add any nested contexts without modifying RLS
5. **Zero RLS customization per fork** — Same policies work for all forks

---

### RLS policy building blocks (shared)

Define reusable SQL fragments for consistent policy definitions:

```typescript
import { sql } from 'drizzle-orm';

// Fail-closed: tenant context must be set
const tenantContextSet = sql`COALESCE(current_setting('app.tenant_id', true), '') != ''`;

// User context must be set (for cross-tenant memberships)
const userContextSet = sql`COALESCE(current_setting('app.user_id', true), '') != ''`;

// Is authenticated check
const isAuthenticated = sql`current_setting('app.is_authenticated', true)::boolean = true`;

// Tenant match helper (for use in policy definitions)
const tenantMatch = (t: { tenantId: any }) => sql`
  ${tenantContextSet}
  AND ${t.tenantId} = current_setting('app.tenant_id', true)::text
`;

// User match helper (for memberships cross-tenant select)
const userMatch = (t: { userId: any }) => sql`
  ${userContextSet}
  AND ${t.userId} = current_setting('app.user_id', true)::text
`;

// Membership EXISTS helper (for product entity policies)
// Includes userContextSet for explicit fail-closed on missing user context
// Includes tenant match for defense against data corruption (same as orgs/activities policies)
const membershipExists = (t: { organizationId: any; tenantId: any }) => sql`
  ${userContextSet}
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = ${t.organizationId}
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = ${t.tenantId}
  )
`;

// Note: parentTenantMatch helper removed — typed FK columns with composite FKs
// provide DB-level integrity without RLS CASE logic. See "Composite foreign keys" section.
```

**Restrictive guard pattern:**

For tables with multiple access patterns (e.g., memberships: user-based + tenant-scoped), use a **RESTRICTIVE** policy as a guard. Postgres combines policies:
- **PERMISSIVE** policies: OR'ed together
- **RESTRICTIVE** policies: AND'ed with the result

A restrictive guard becomes a hard gate that applies regardless of permissive policies:

```typescript
// Restrictive guard: at least one context var must be set
pgPolicy('table_context_guard', {
  as: 'restrictive',
  for: 'select',
  using: sql`${tenantContextSet} OR ${userContextSet}`,
}),
```

**Important:** The guard only ensures context exists — it doesn't scope rows. The permissive policies must still enforce row-level access (user match, membership exists, etc.).

### Session variable protocol

Every tenant-scoped request sets session variables in a transaction using `set_config()`. Create a centralized helper:

```typescript
// backend/src/db/tenant-context.ts
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './db';

interface TenantContext {
  tenantId: string;          // '' for /me routes
  userId: string | null;     // null for public
  isAuthenticated: boolean;
}

/**
 * Wraps a database operation in a transaction with tenant context set.
 * All authenticated tenant-scoped queries must use this wrapper.
 */
export async function withTenantContext<T>(
  db: Db,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Use set_config for transaction-scoped session variables
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', ${ctx.isAuthenticated ? 'true' : 'false'}, true)`);
    return fn(tx);
  });
}

/**
 * Wraps a public route database operation with tenant-only context.
 * Uses publicReadDb exclusively - forces unauthenticated context.
 * 
 * IMPORTANT: This wrapper is mandatory for /public routes. Do NOT use
 * withTenantContext with unsafeInternalDb for public routes - this ensures
 * public handlers can only query security-barrier views, never base tables.
 */
export async function withPublicTenantContext<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return publicReadDb.transaction(async (tx) => {
    // Only set tenant_id - user context is forced to unauthenticated
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', 'false', true)`);
    return fn(tx);
  });
}
```

The third parameter `true` makes variables transaction-scoped (auto-reset on commit/rollback). Handlers receive `tx` from Hono context, not raw `db`.

### FORCE ROW LEVEL SECURITY

All tenant-scoped tables must have `FORCE ROW LEVEL SECURITY` enabled. This ensures RLS applies even to table owners:

```sql
-- Applied in migration for each tenant-scoped table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages FORCE ROW LEVEL SECURITY;

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities FORCE ROW LEVEL SECURITY;
```

**Note:** Drizzle's `pgPolicy` automatically enables RLS, but `FORCE` must be added via custom migration SQL or post-migration script.

**Role security requirements:**
- `runtime_role` must NOT be table owner and must NOT have `BYPASSRLS`
- `runtime_role` cannot `SET ROLE` to admin roles
- `public_read_role` has NO `BYPASSRLS` — uses security-barrier views for safe public access
- `admin_role` connection must not be reachable from untrusted environments

**Table ownership and FORCE RLS:**

Migrations commonly create tables owned by the migration role. If the migration role is also used at runtime in some environments, `FORCE ROW LEVEL SECURITY` can behave differently than expected.

**Fix: Explicitly set ownership in migrations:**

```sql
-- In migration: ensure tables are owned by admin role, not runtime role
ALTER TABLE organizations OWNER TO admin_role;
ALTER TABLE memberships OWNER TO admin_role;
ALTER TABLE attachments OWNER TO admin_role;
ALTER TABLE pages OWNER TO admin_role;
ALTER TABLE activities OWNER TO admin_role;

-- Grant only needed privileges to runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO runtime_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON activities TO runtime_role;
```

**Schema audit query (run in CI):**

```sql
-- Verify no tenant-scoped tables are owned by runtime role
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'memberships', 'attachments', 'pages', 'activities')
  AND tableowner = 'runtime_role';
-- Should return 0 rows

-- Verify FORCE RLS is enabled on all tenant-scoped tables
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('organizations', 'memberships', 'attachments', 'pages', 'activities')
  AND (relrowsecurity = false OR relforcerowsecurity = false);
-- Should return 0 rows
```

### Connection access pattern (`unsafeInternal` prefix)

DB connections are exported with `unsafeInternal` prefix to signal danger:

```typescript
// backend/src/db/index.ts

// DANGER: Direct db access bypasses middleware-provided context
// Only use for scripts, migrations, and explicit admin handlers
export const unsafeInternalDb = drizzle(...);
export const unsafeInternalAdminDb = drizzle({ ... }); // BYPASSRLS role, full access

// Public read connection - SELECT only on security-barrier views, for /public routes
// Safe: views enforce visibility rules at DB level, no BYPASSRLS
export const publicReadDb = drizzle({ connectionString: env.DATABASE_PUBLIC_READ_URL });

// Handlers should NEVER import unsafeInternal* directly - use context-provided tx
// publicReadDb is MANDATORY for /public route handlers (via hasPublicTenantAccess middleware)
// Never use unsafeInternalDb for /public routes - this prevents future handler bugs from
// accidentally querying base tables if a policy is wrong or a column is added without policy update
```

**Making the safe path the easy path:**

To prevent accidental misuse of raw DB connections:

1. **Do not export runtime db from common modules** — Export only factory functions used by middleware. Handlers receive `ctx.var.db` (the transaction), never raw connections.

2. **Deep import path for unsafe access** — Put `unsafeInternal*` exports behind a deep/internal import path:
   ```typescript
   // ❌ BAD: easy to import
   import { unsafeInternalDb } from '#/db';
   
   // ✅ GOOD: requires explicit intent
   import { unsafeInternalDb } from '#/db/internal/unsafe-connections';
   ```

3. **Lint rule** — Add ESLint/Biome rule to flag `unsafeInternal` imports outside approved folders (`scripts/`, `tests/`, `system/` handlers).

4. **CI grep test** — Add a test that greps for `unsafeInternalDb` imports and fails if found in handler files:
   ```bash
   # In CI pipeline
   ! grep -r "unsafeInternalDb" backend/src/modules/*/handlers.ts
   ```

**Middleware provides correct connection (cascading pattern):**

Cella's existing `xGuard` pattern already chains middlewares per route. Add `tenantGuard` as a new guard option:

```typescript
// backend/src/middlewares/guard/tenant-guard.ts
// For AUTHENTICATED tenant-scoped routes only
export const tenantGuard = xMiddleware('tenantGuard', 'x-guard', async (ctx, next) => {
  const tenantId = ctx.req.param('tenantId');
  if (!tenantId) throw new AppError(400, 'invalid_request', 'error');
  
  validateTenantId(tenantId); // Format check
  
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;
  
  // Require authenticated user (this middleware is for authenticated routes)
  if (!user || !memberships) {
    throw new AppError(401, 'unauthorized', 'warn');
  }
  
  // Verify user has access to this tenant
  const hasTenantMembership = memberships.some(m => m.tenantId === tenantId);
  if (!hasTenantMembership && ctx.var.userSystemRole !== 'admin') {
    throw new AppError(403, 'forbidden', 'warn', { resource: 'tenant' });
  }
  
  // Wrap remaining middleware chain in tenant context using runtime DB
  return withTenantContext(unsafeInternalDb, {
    tenantId,
    userId: user.id,
    isAuthenticated: true,
  }, async (tx) => {
    ctx.set('db', tx);
    ctx.set('tenantId', tenantId);
    await next();
  });
});

// backend/src/middlewares/guard/has-public-tenant-access.ts
// For PUBLIC routes only - uses publicReadDb with security-barrier views
export const hasPublicTenantAccess = xMiddleware('hasPublicTenantAccess', 'x-guard', async (ctx, next) => {
  const tenantId = ctx.req.param('tenantId');
  if (!tenantId) throw new AppError(400, 'invalid_request', 'error');
  
  validateTenantId(tenantId); // Format check
  
  // Wrap in public tenant context - uses publicReadDb exclusively
  // This ensures handlers can ONLY query security-barrier views, never base tables
  return withPublicTenantContext(tenantId, async (tx) => {
    ctx.set('db', tx);
    ctx.set('tenantId', tenantId);
    await next();
  });
});
```

**Updated guard exports:**

```typescript
// backend/src/middlewares/guard/index.ts
export * from './tenant-guard';         // Authenticated tenant routes
export * from './has-public-tenant-access';  // Public routes (uses publicReadDb)
export * from './has-system-access';
export * from './is-authenticated';
export * from './is-public-access';
export * from './sys-admin-guard';
// Note: orgGuard is removed - org access checked at handler level
```

**Route usage via xGuard:**

```typescript
// Tenant-scoped route (org access checked in handler, not middleware)
createXRoute({
  path: '/:tenantId/:orgId/attachments',
  xGuard: [isAuthenticated, tenantGuard],  // Uses unsafeInternalDb with RLS
  // ...
});

// Public tenant route (no auth required) - uses publicReadDb with views
createXRoute({
  path: '/public/:tenantId/pages/:id',
  xGuard: [hasPublicTenantAccess],  // Uses publicReadDb (security-barrier views only)
  // ...
});

// /me route (no tenant context, uses cross-tenant RLS)
createXRoute({
  path: '/me/memberships',
  xGuard: [isAuthenticated],  // No tenantGuard
  // ...
});
```

**Guard chain → db connection mapping:**

| xGuard Chain | `ctx.var.db` Returns | Database Connection |
|--------------|----------------------|---------------------|
| `[isAuthenticated, tenantGuard]` | Tenant-scoped tx (RLS active) | `unsafeInternalDb` (runtime_role) |
| `[hasPublicTenantAccess]` | Public tenant-scoped tx | `publicReadDb` (public_read_role) |
| `[isAuthenticated]` | Default db (cross-tenant read via RLS) | `unsafeInternalDb` (runtime_role) |
| `[isAuthenticated, hasSystemAccess]` | Admin db (bypasses RLS) | `unsafeInternalAdminDb` (admin_role) |

**Critical:** `/public` routes MUST use `hasPublicTenantAccess`, never `tenantGuard`. This ensures:
- Public handlers can only query security-barrier views, not base tables
- Future handler bugs cannot accidentally query base tables with wrong policies
- No risk of policy bypass if a column is added without policy update

**Organization access at handler level:**

`orgGuard` middleware is removed. Context entity access is checked in handlers. Use `unsafeInternalAdminDb` for migrations, seeds, system admin endpoints, and background jobs (never injected via middleware).

### URL routing

Tenant ID is included in URLs for all org-scoped routes. This ensures RLS context is set from the URL before any database access.

#### Backend routes

| Pattern | Auth | Tenant Source | Example |
|---------|------|---------------|---------|
| `/:tenantId/:orgIdOrSlug/...` | Required | URL path | `GET /x7Kp2m/acme-corp/attachments` |
| `/public/:tenantId/...` | None | URL path | `GET /public/x7Kp2m/attachments/abc123` |
| `/me/...` | Required | N/A (user-scoped) | `GET /me/memberships` |
| `/auth/...` | None | N/A (pre-auth) | `POST /auth/sign-in` |
| `/system/...` | Admin | N/A (admin bypass) | `GET /system/tenants` |

**Key principle:** Tenant context comes from URL, not derived from fetched data. RLS is active before any tenant-scoped query.

#### Frontend routes

Frontend routes mirror backend pattern:

| Pattern | Example |
|---------|---------|
| `/:tenantId/:orgSlug/...` | `/x7Kp2m/acme-corp/dashboard` |
| `/:tenantId/:orgSlug/attachments` | `/x7Kp2m/acme-corp/attachments` |

**Frontend extracts tenantId from URL** — no need to fetch from `/me` for URL construction.

### Middleware changes

Replace `orgGuard` middleware with `tenantGuard` (authenticated) and `hasPublicTenantAccess` (public):

**For `tenantGuard` (authenticated routes):**
1. Extract `tenantId` from URL path parameter
2. Validate format (6-char lowercase alphanumeric)
3. Validate user has membership in this tenant (check memberships from auth)
4. Set `tenantId` in Hono context
5. Wrap handler in transaction with session variables (using `unsafeInternalDb`)

**For `hasPublicTenantAccess` (public routes):**
1. Extract `tenantId` from URL path parameter
2. Validate format (6-char lowercase alphanumeric)
3. Set `tenantId` in Hono context (no auth required)
4. Wrap handler in transaction with session variables (using `publicReadDb`)

Organization access is no longer checked at middleware level — it's checked in handlers when needed (same as other context entities).

Flow:

```
Request: GET /:tenantId/:orgIdOrSlug/attachments
    ↓
isAuthenticated (sets: user, memberships)
    ↓
tenantGuard (validates tenantId, wraps in withTenantContext, sets: db, tenantId)
    ↓
Handler (checks org access, queries with tenant-scoped db via RLS)
```

For public routes:

```
Request: GET /public/:tenantId/attachments/:id
    ↓
hasPublicTenantAccess (validates tenantId from URL, uses publicReadDb)
    ↓
Handler (queries security-barrier views, only public rows visible)
```

### CDC changes

Minimal changes required:

- `tenants` table added to CDC tracked tables (for tenant create/update/archive events)
- Activities table includes `tenantId` column
- CDC Worker parses `tenantId` from activity rows
- ActivityBus routes by `tenantId` (or `organizationId` within tenant)
- SSE subscriptions include tenant context

### Security hardening

#### Tenant ID validation

Treat tenant IDs as untrusted input. IDs are **lowercase only** to prevent canonicalization bugs (two URLs differing only by case), caching issues, and inconsistent lookups:

```typescript
const TENANT_ID_REGEX = /^[a-z0-9]{6}$/; // 6-char lowercase alphanumeric ONLY

function validateTenantId(id: string): void {
  if (!TENANT_ID_REGEX.test(id)) {
    throw new Error('Invalid tenant ID format');
  }
}

// For case-insensitive URLs, normalize before validation:
function normalizeTenantId(id: string): string {
  return id.toLowerCase();
}
```

**Important:** Always normalize `tenantId = tenantId.toLowerCase()` before setting context, and ensure IDs are stored lowercase at creation time.

### SQL identifier escaping

All dynamic SQL uses proper escaping:

```typescript
// Always use set_config with parameterized values
await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);

// Never string concatenation
// BAD: sql.raw(`SELECT set_config('app.tenant_id', '${tenantId}', true)`)
```

### Database privilege lockdown

Apply standard PostgreSQL privilege hardening: revoke public schema access, grant minimal privileges per role, prevent role escalation. See PostgreSQL security best practices.

### Tenant lifecycle

Two-step deletion: set `status = 'archived'`, then admin job deletes after delay. Log tenant lifecycle events via activities table.

### Security regression tests

Automated tests verifying tenant isolation (**must-have** before production):

- Deny access when `tenant_id` spoofed without valid membership (GUC spoof test)
- Allow access when `tenant_id` matches and user has membership
- Deny access when `app.tenant_id` is not set or empty (fail-closed)
- Block cross-tenant reads and writes
- Block INSERT/UPDATE/DELETE without membership in target organization
- Block INSERT/UPDATE with `tenant_id != app.tenant_id` (WITH CHECK violation)
- Block UPDATE that changes `tenant_id`
- Block INSERT with `organization_id` from different tenant (composite FK violation)
- Block INSERT with `page_id` from different tenant (composite FK violation)
- Show only `is_public=true` rows to unauthenticated users
- Block writes from unauthenticated users
- Allow SELECT on own memberships across tenants, block others
- Verify no context leakage across pooled connections
- Verify `publicReadDb` can only SELECT from security-barrier views (not tables)
- Verify security-barrier views only return public rows
- Return 404 (not 403) for non-public or wrong-tenant `/public` route requests
- Verify FORCE RLS applies even to table owner role

## Frontend changes

All org-scoped routes include tenantId:

| Current | New |
|---------|-----|
| `/:orgSlug/...` | `/:tenantId/:orgSlug/...` |
| `/user/settings` | `/user/settings` (unchanged) |
| `/system/...` | `/system/...` (unchanged) |

Update TanStack Router: add `$tenantId` parent route, update navigation helpers and API client to include tenantId. Add `TenantsTable` to system panel at `/system/tenants`.

## Seed changes

Update seed script to create tenant hierarchy:

- **1 default tenant** — For existing installations
- **3 tenants** — For development/testing multi-tenant scenarios
- **Organizations distributed across tenants**

## Implementation checklist

### Phase 1: Schema changes

- [x] Create `tenants` table in `backend/src/db/schema/tenants.ts`
- [x] Add `tenant_status` enum (`active`, `suspended`, `archived`)
- [x] Add `'tenant'` to `resourceTypes` in shared config
- [x] Add `tenant_id` column (with FK to tenants) to: organizations, memberships, inactive_memberships, pages, attachments, activities
- [x] Ensure `organization_id` is required (NOT NULL) on ALL tenant-scoped tables (fork contract)
- [x] Add compound unique `(tenant_id, id)` on organizations (for composite FK targets)
- [x] Add compound unique `(tenant_id, id)` on pages (for attachments composite FK)
- [x] Add composite FK `(tenant_id, organization_id) → organizations(tenant_id, id)` on: memberships, inactive_memberships, pages, attachments, activities
- [x] Replace polymorphic `entityId`/`entity` with typed FK column `pageId` on attachments
- [x] Backfill: `UPDATE attachments SET page_id = entity_id WHERE entity = 'page'`
- [x] Add composite FK `(tenant_id, page_id) → pages(tenant_id, id)` on attachments
- [x] Drop `entityId` and `entity` columns from attachments
- [x] Migrate `uniqueKey` to native composite unique `(tenant_id, user_id, organization_id)` on memberships
- [x] Migrate `uniqueKey` to native composite unique on inactive_memberships
- [x] Drop `uniqueKey` column and update insert/conflict logic in membership handlers

### Phase 2: RLS infrastructure

- [x] Create RLS policy building blocks in `backend/src/db/rls-helpers.ts`:
  - [x] `tenantContextSet`, `userContextSet`, `isAuthenticated` expressions
  - [x] `tenantMatch(t)`, `userMatch(t)`, `membershipExists(t)` helpers
- [x] Add RLS policies to `organizations` (cross-tenant read, tenant-scoped write)
- [x] Add RLS policies to `memberships` (restrictive guard + dual-path SELECT + tenant-scoped write)
- [x] Add RLS policies to `inactive_memberships` (same pattern as memberships)
- [x] Pages exempt from RLS (public entity — write protection via `isAuthenticated` middleware)
- [x] Add RLS policies to `attachments` (standard strict, tenant-scoped)
- [x] Configure `activities` with privilege-based protection (no RLS — CDC role has INSERT only)
- [x] Add immutability trigger for memberships key fields (`tenant_id`, `organization_id`, `user_id`)
- [x] Add immutability trigger for inactive_memberships key fields
- [x] Add immutability triggers for context entities and product entities
- [x] Create `withTenantContext` helper in `backend/src/db/tenant-context.ts`
- [x] Create `withPublicTenantContext` helper (uses session var `is_authenticated=false`, not separate connection)
- [x] Add FORCE ROW LEVEL SECURITY to tenant-scoped tables (except activities, pages) via migration SQL

### Phase 3: Database roles and connections

- [x] Create database roles: `runtime_role`, `cdc_role`, `admin_role` (in migration)
- [x] Configure `admin_role` with BYPASSRLS
- [x] Configure `cdc_role` with REPLICATION (no BYPASSRLS)
- [x] Set table ownership to `admin_role` in migrations (ALTER TABLE ... OWNER TO)
- [x] Grant SELECT, INSERT, UPDATE, DELETE on tables to `runtime_role` (except activities)
- [x] Grant SELECT only on `activities` to `runtime_role` (read-only for app)
- [x] Grant INSERT only on `activities` to `cdc_role` (append-only for CDC)
- [x] Grant SELECT, INSERT, UPDATE on `counters` to `cdc_role` (sequence tracking)
- [x] Add `DATABASE_URL` and `DATABASE_ADMIN_URL` to config
- [x] Create `db` export (runtime_role, subject to RLS)
- [x] Create `migrationDb` export for migrations/seeds only (superuser)
- ~~Create security-barrier views~~ — Removed: public access via RLS policies (`is_authenticated=false`) instead
- ~~Create `public_read_role`~~ — Removed: public access via session variables, not separate role
- ~~Create `publicReadDb` export~~ — Removed: single `db` connection with policy-based public access
- [x] Create `cdcDb` export in CDC Worker (uses DATABASE_CDC_URL with cdc_role)
- [ ] Apply privilege lockdown migration (revoke public schema access)
- [ ] Add schema audit queries to CI (ownership check, FORCE RLS check)

### Phase 4: Backend routes and middleware

- [x] Create `backend/src/modules/tenants/` module:
  - [x] `tenants-routes.ts` - system admin routes for tenant CRUD
  - [x] `tenants-handlers.ts` - tenant management handlers
  - [x] `tenants-schema.ts` - Zod schemas for tenant operations
- [x] Create `validateTenantId()` helper (regex: `/^[a-z0-9]{6}$/`)
- [x] Create `normalizeTenantId()` helper (lowercase normalization)
- [x] Create `tenantGuard` middleware using `withTenantContext` (authenticated routes)
- [x] Create `hasPublicTenantAccess` middleware using `withPublicTenantContext` (public routes)
- [x] Update `isAuthenticated` middleware to set `app.user_id` context for `/me/*` routes
- [ ] Remove `orgGuard` middleware (org access checked at handler level) — still exists, some routes use it
- [x] Update all org-scoped routes to `/:tenantId/:orgIdOrSlug/...` pattern
- [ ] Create `/public/:tenantId/...` routes using `hasPublicTenantAccess` — middleware exists but no routes yet
- [x] Update handlers to use `ctx.var.db` (transaction) instead of raw db imports
- [ ] Update CDC Worker to parse `tenantId` from activity rows
- [ ] Add lint rule (Biome) to flag `migrationDb` imports outside approved folders
- [ ] Add CI grep test for `migrationDb` imports in handler files

### Phase 5: Frontend

- [x] Create `frontend/src/modules/tenants/` module
- [x] Build TenantsTable component for system panel at `/system/tenants`
- [x] Update route tree: add `$tenantId` parent route for org routes
- [x] Update all org-scoped route paths from `/$orgSlug/...` to `/$tenantId/$orgSlug/...`
- [x] Update navigation helpers to include tenantId in org-scoped URLs
- [x] Update API client calls to include tenantId path parameter
- [x] Update link generation throughout app

### Phase 6: Testing and deployment

- [ ] Add security regression tests:
  - [ ] GUC spoof test (deny access when tenant_id spoofed without valid membership)
  - [ ] Fail-closed test (deny when `app.tenant_id` is not set or empty)
  - [ ] Restrictive guard test (deny SELECT when neither tenant nor user context set)
  - [ ] Cross-tenant isolation (block cross-tenant reads and writes)
  - [ ] Membership check (block operations without membership in target org)
  - [ ] WITH CHECK violation (block INSERT/UPDATE with mismatched tenant_id)
  - [ ] Immutability trigger (block UPDATE of tenant_id, organization_id, user_id on memberships)
  - [ ] Composite FK violation (block INSERT with organization_id from different tenant)
  - [ ] Public visibility (show only is_public=true rows when is_authenticated=false)
  - [ ] Public write block (block writes when is_authenticated=false)
  - [ ] Cross-tenant membership SELECT (allow own memberships, block others)
  - [ ] Connection context isolation (no context leakage across pooled connections)
  - [ ] FORCE RLS (verify RLS applies even to table owner role)
  - [ ] Activities privilege (verify runtime_role cannot INSERT/UPDATE/DELETE activities)
- [ ] Add fork contract validation test (all tenant-scoped tables have org_id + composite FK)
- [x] Generate Drizzle migration (`drizzle-kit generate`)
- [ ] Update seed script to create tenants (1 default + 3 dev tenants)
- [ ] Distribute seed organizations across tenants
- [ ] Test migration on staging environment
- [ ] Apply migrations via `drizzle-kit migrate` in CI/prod

**Post-migration verification:**
```sql
-- Verify FORCE RLS is enabled
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE relname IN ('organizations', 'memberships', 'attachments', 'pages', 'activities');
-- Both columns should be true for all tenant-scoped tables (except activities which has no RLS)

-- Verify public access via session variable (not separate role)
BEGIN;
SELECT set_config('app.tenant_id', 'abc123', true);
SELECT set_config('app.is_authenticated', 'false', true);
SELECT * FROM pages WHERE is_public = true LIMIT 1; -- Should succeed (public rows)
SELECT * FROM pages WHERE is_public = false LIMIT 1; -- Should return no rows (policy blocks)
ROLLBACK;

-- Fork contract validation: all tenant-scoped tables have organization_id
-- (Exclude tenant-only tables like tenant_settings if they exist)
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_name = t.tablename AND c.column_name = 'tenant_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_name = t.tablename AND c.column_name = 'organization_id'
  )
  AND t.tablename NOT IN ('tenants', 'tenant_settings'); -- Known tenant-only tables
-- Should return 0 rows (all tenant-scoped tables have organization_id)

-- Fork contract validation: all tables with organization_id have composite FK
SELECT tc.table_name
FROM information_schema.columns c
JOIN pg_tables tc ON tc.tablename = c.table_name AND tc.schemaname = 'public'
WHERE c.column_name = 'organization_id'
  AND c.table_name != 'organizations'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints con
    JOIN information_schema.key_column_usage kcu ON con.constraint_name = kcu.constraint_name
    WHERE con.table_name = c.table_name
      AND con.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('tenant_id', 'organization_id')
    GROUP BY con.constraint_name
    HAVING COUNT(*) = 2
  );
-- Should return 0 rows (all org-scoped tables have composite FK)
```

## Out of scope

- **Schema-per-tenant** — RLS provides isolation; schema separation adds complexity without proportional benefit
- **Database-per-tenant** — Future upgrade path if needed; tenantId column prepares for this
- **Per-tenant customization** — All tenants share identical schema
- **Tenant-specific resource limits** — PostgreSQL doesn't support per-RLS-policy limits
- **Automated tenant archival** — Manual process via status enum
- **Project/workspace-level RLS** — Intentionally out of scope; org boundary is the DB enforcement layer

## Future considerations

If stronger isolation is needed later:

| Current (RLS) | Future Option |
|---------------|---------------|
| Shared tables with RLS | Database-per-tenant with connection routing |
| `tenantId` column | Becomes database selection key |
| `tenantsTable` | Becomes tenant registry with connection strings |

The `tenantId` column and infrastructure built now prepares for this upgrade path.