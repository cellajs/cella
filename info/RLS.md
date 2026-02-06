This document describes the architectural plan for implementing PostgreSQL Row-Level Security (RLS) based tenant isolation in Cella.

**References:**
- [Drizzle v1 RLS API](https://orm.drizzle.team/docs/rls)
- [Neon RLS with Drizzle guide](https://neon.com/docs/guides/rls-drizzle)

---

## Drizzle v1 RLS rules

Critical patterns for Drizzle v1 RLS:

- **If you add policies, RLS is enabled automatically** — you do **not** need `.enableRLS()` or `.withRLS()` on those tables.
- `.withRLS()` is **only** for tables that need RLS enabled without policies (edge case).
- Define policies inside the `pgTable(..., (table) => [ pgPolicy(...) ])` callback.
- Use `pgRole` with `.existing()` when referencing roles you don't want migrations to create.

---

## Problem

Cella currently uses row-level filtering (`organizationId` column) for data scoping. All filtering happens at the application layer via `hasOrgAccess` middleware. This approach has limitations:

- **No database-level isolation** — A bug in application code could leak data across tenants
- **Defense-in-depth gap** — Security relies entirely on correct application-layer filtering
- **SQL injection risk** — Compromised queries can access any tenant's data
- **No tenant abstraction** — Organizations are the top-level scope, limiting multi-tenant SaaS patterns

## Goal

Implement PostgreSQL RLS-based tenant isolation where:

- A new `tenants` table (system resource) handles isolation as its sole responsibility
- All tenant-scoped tables have `tenantId` column with RLS policies
- Database enforces tenant boundaries — even buggy/compromised code can't cross tenants
- Shared resources (users, sessions, tokens) remain tenant-agnostic
- Context entities (organizations) and memberships include `tenantId` for scoping
- The sync engine continues to operate with minimal changes
- Future upgrade path to database-per-tenant remains open

## Requirements

1. **Tenant as resource** — `tenant` is a resource type (ResourceType), not an entity (no `entityBase`, no CRUD routes)
2. **Denormalized tenantId** — Add `tenantId` column to organizations, memberships, product entities, activities
3. **Required tenantId** — `tenantId` is never null; forks not using multi-tenancy use a single default tenant
4. **RLS on all tenant-scoped tables** — Every table with `tenantId` has isolation policy
5. **Session variable protocol** — Every request sets `app.tenant_id` in transaction via `set_config()` (transaction-scoped)
6. **Split DB roles** — Runtime role subject to RLS; admin role bypasses for migrations
7. **Sync engine compatibility** — CDC Worker parses `tenantId` from activities
8. **Cross-tenant queries** — Users with multi-tenant memberships can query across tenants via session var switching
9. **Tenant in URLs** — Both frontend and backend routes include `tenantId` prefix for tenant scoped routes
10. **Public content support** — RLS policy allows unauthenticated **read-only** access to `is_public = true` items within a tenant (tenant context still required from URL)

## Constraints

- **Transaction wrapping** — All tenant-scoped queries must run in transaction for `SET LOCAL` to work
- **Admin bypass** — System admins need cross-tenant access; handled via `unsafeInternalAdminDb` connection (role-based bypass, not session variable)
- **Short tenant ID** — 6-character nanoid for URL-friendliness; collision handled at creation time

## Architectural solution

### New tenants table

Create `tenants` as a system resource (like `sessions`, `activities`) — not an entity:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | varchar(6), PK | Tenant ID (6-char lowercase alphanumerical nanoid (existing util), e.g., `x7kp2m`) |
| `name` | varchar | Display name for admin UI |
| `status` | enum | `active`, `suspended`, `archived` |
| `createdAt` | timestamp | Creation timestamp |
| `modifiedAt` | timestamp | Last modification timestamp |

```typescript
// backend/src/db/schema/tenants.ts
import { pgTable, pgEnum, varchar, timestamp } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'archived']);

export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 6 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Key design decisions:**
- **Short ID** — 6-character nanoid for URL-friendliness (existing util)
- **Not an entity** — Added to `resourceTypes` in config (alongside `request`, `membership`), not entity hierarchy
- **System admin only** — Tenants created/managed via `/system/tenants` routes (explicit handlers, not entityBase CRUD generation)
- **Collision handling** — On duplicate ID, creation fails; admin retries (extremely rare)

**Naming convention (important for RLS correctness):**

Use **snake_case DB column names** for anything referenced in policies. In Drizzle, alias them explicitly:

```typescript
tenantId: varchar('tenant_id', { length: 6 }).notNull()
```

This avoids accidental `"tenantId"` quoting problems in RLS expressions.

### Tenant scope configuration

Tenant scoping is derived from the entity hierarchy:

- **Context entities** (`contextEntityTypes`) — Always tenant-scoped
- **Product entities** (`productEntityTypes`) — Always tenant-scoped
- **Public product entities** (`publicProductEntityTypes`) — Tenant-scoped with **public-aware RLS policy** (unauthenticated read access for `is_public = true` rows)

From existing config:
```typescript
contextEntityTypes: ['organization'] as const,
productEntityTypes: ['attachment', 'page'] as const,
publicProductEntityTypes: ['page'] as const,
```

This means:
- `organization` → tenant-scoped (context entity, authenticated-only policy)
- `attachment` → tenant-scoped (product entity, authenticated-only policy)
- `page` → tenant-scoped (product entity, **public-aware policy** — unauthenticated can read `is_public = true`)

**Key insight:** `publicProductEntityTypes` doesn't mean "not tenant-scoped" — it means the entity uses a public-aware RLS policy that allows unauthenticated read access within the tenant. The tenantId is still required (from URL) and enforced by RLS.

**No additional config needed** — tenant scope is derived from existing hierarchy.

### tenantId on tenant-scoped tables

Add `tenantId` as a required column with RLS policy:

| Table | tenantId Column | RLS Policy |
|-------|-----------------|------------|
| `organizations` | `tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id)` | Yes |
| `memberships` | `tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id)` | Yes |
| `attachments` | `tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id)` | Yes |
| `pages` | `tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id)` | Yes (public-aware) |
| `activities` | `tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id)` | Yes |

**Not tenant-scoped:**
- `users` — Special entity, shared across tenants

**tenantId is always required** — Forks not using multi-tenancy use a single default tenant. This eliminates null-checking edge cases.

### RLS policy pattern

Tenant-scoped tables use one of two policy patterns depending on whether they support public access:

| Table | Has `is_public` | Policy Type |
|-------|-----------------|-------------|
| `organizations` | No | Authenticated-only |
| `memberships` | No | Special (see below) |
| `attachments` | Yes | Public-aware |
| `pages` | Yes | Public-aware |
| `activities` | No | Authenticated-only |

#### Security principles

**Fail-closed enforcement:** All policies deny access when `app.tenant_id` is NULL or empty. This prevents accidental data exposure if middleware fails to set context.

**Role-based admin bypass:** Do not trust a boolean session variable (`app.is_system_admin`) as the only bypass. Use an **admin role/connection** with `BYPASSRLS` for migrations/system jobs. Admin handlers explicitly use `unsafeInternalAdminDb` — this makes dangerous paths grep-able and auditable.

**Operation-specific policies:** Instead of `FOR ALL`, use separate `FOR SELECT`, `FOR INSERT`, `FOR UPDATE`, `FOR DELETE` policies. This provides:
- Granular control over read vs write operations
- `WITH CHECK` clauses for write operations to prevent tenant boundary violations
- Clearer audit trail and easier debugging

**Explicit parentheses:** All `AND`/`OR` combinations use explicit parentheses to prevent precedence bugs.

#### Standard policy (authenticated-only)

For tables without public access. Split into separate policies per operation:

```sql
-- SELECT: Read access for authenticated users in matching tenant
CREATE POLICY tenant_select_policy ON <table>
  FOR SELECT
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- INSERT: New rows must match tenant context
CREATE POLICY tenant_insert_policy ON <table>
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- UPDATE: Can only update own tenant rows, cannot change tenant_id
CREATE POLICY tenant_update_policy ON <table>
  FOR UPDATE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- DELETE: Can only delete from own tenant
CREATE POLICY tenant_delete_policy ON <table>
  FOR DELETE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );
```

**Key safeguards:**
- `COALESCE(..., '') != ''` — Fail-closed: denies access when tenant context is missing
- `WITH CHECK` on INSERT/UPDATE — Prevents writing rows with wrong `tenant_id`
- UPDATE has both `USING` (which rows can be updated) and `WITH CHECK` (what values are valid) — Prevents changing `tenant_id` to another tenant
- **No inline admin bypass** — Policies are strict; admin access uses `unsafeInternalAdminDb` connection with `BYPASSRLS` role

#### Public-aware policy

For tables with `is_public` column. Public access is **read-only**; writes require authentication:

```sql
-- SELECT: Authenticated users see all, public users see only is_public=true
CREATE POLICY tenant_public_select_policy ON <table>
  FOR SELECT
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND (
      current_setting('app.is_authenticated', true)::boolean = true
      OR is_public = true
    )
  );

-- INSERT: Authenticated users only, must match tenant
CREATE POLICY tenant_public_insert_policy ON <table>
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- UPDATE: Authenticated users only, cannot change tenant_id
CREATE POLICY tenant_public_update_policy ON <table>
  FOR UPDATE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- DELETE: Authenticated users only
CREATE POLICY tenant_public_delete_policy ON <table>
  FOR DELETE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );
```

**Session variables:**
- `app.tenant_id` — Always set from URL path
- `app.user_id` — From authenticated session (for memberships cross-tenant access)
- `app.is_authenticated` — True if valid session

**Policy logic:**
- Authenticated users: see all rows in their tenant, can create/update/delete
- Public users: see only `is_public = true` rows in the tenant, **cannot write**
- Missing tenant context: **denied** (fail-closed)
- Admin bypass: use `unsafeInternalAdminDb` connection (not session variable)

#### Memberships policy (special case)

Memberships need cross-tenant **read** access for `/me/memberships` routes, but writes must remain tenant-scoped:

```sql
-- SELECT: User can read their own memberships across all tenants
CREATE POLICY memberships_select_policy ON memberships
  FOR SELECT
  USING (
    current_setting('app.is_authenticated', true)::boolean = true
    AND (
      -- Standard tenant isolation
      (
        COALESCE(current_setting('app.tenant_id', true), '') != ''
        AND tenant_id = current_setting('app.tenant_id', true)::text
      )
      -- OR user can see their own memberships across tenants (for /me routes)
      OR (
        COALESCE(current_setting('app.user_id', true), '') != ''
        AND user_id = current_setting('app.user_id', true)::text
      )
    )
  );

-- INSERT: Must be authenticated and match tenant context
CREATE POLICY memberships_insert_policy ON memberships
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- UPDATE: Must match tenant context, cannot change tenant_id
CREATE POLICY memberships_update_policy ON memberships
  FOR UPDATE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );

-- DELETE: Must match tenant context
CREATE POLICY memberships_delete_policy ON memberships
  FOR DELETE
  USING (
    COALESCE(current_setting('app.tenant_id', true), '') != ''
    AND tenant_id = current_setting('app.tenant_id', true)::text
    AND current_setting('app.is_authenticated', true)::boolean = true
  );
```

**Key safeguards:**
- SELECT allows cross-tenant via `user_id` match — needed for `/me/memberships`
- INSERT/UPDATE/DELETE are **strictly tenant-scoped** with `WITH CHECK`
- User cannot create/modify/delete memberships in other tenants
- Fail-closed: all write operations require valid `app.tenant_id`
- Fail-closed for user_id: cross-tenant SELECT requires valid `app.user_id` (not empty)

This requires adding `app.user_id` session variable (set alongside `app.tenant_id`).

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
```

### Drizzle implementation

Drizzle v1 enables RLS automatically when `pgPolicy` is added — no need for `.withRLS()` or `.enableRLS()`:

```typescript
import { pgTable, pgPolicy, varchar, sql } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const organizations = pgTable('organizations', {
  id: varchar('id', { length: 12 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  // ... existing columns
}, (t) => [
  // RLS is enabled automatically when policies are added
  pgPolicy('tenant_select_policy', {
    for: 'select',
    using: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
    `,
  }),
  pgPolicy('tenant_insert_policy', {
    for: 'insert',
    withCheck: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
    `,
  }),
  pgPolicy('tenant_update_policy', {
    for: 'update',
    using: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
    `,
    withCheck: sql`
      ${t.tenantId} = current_setting('app.tenant_id', true)::text
      AND ${isAuthenticated}
    `,
  }),
  pgPolicy('tenant_delete_policy', {
    for: 'delete',
    using: sql`
      ${tenantMatch(t)}
      AND ${isAuthenticated}
    `,
  }),
]);
```

**Note:** No `.withRLS()` needed — Drizzle v1 enables RLS automatically when policies are defined.

### Neon `crudPolicy` guidance

Neon recommends Drizzle for RLS and highlights the `crudPolicy` helper. However, `crudPolicy` and helpers like `authenticatedRole/anonymousRole/authUid` are primarily aligned with **Neon Data API** patterns (JWT → `auth.user_id()`), not our `app.*` session variables approach.

**Recommendation:**
- Keep `pgPolicy` for tenant isolation with `app.tenant_id`
- If you later expose the DB via Neon Data API, consider adding **additional** policies using `crudPolicy` and `auth.user_id()` patterns for direct client access

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
 * All tenant-scoped queries must use this wrapper.
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
```

**Session variables:**
- `app.tenant_id` — From URL path (empty string for /me routes)
- `app.user_id` — From authenticated session (for memberships cross-tenant access)
- `app.is_authenticated` — True if valid session

**Why `set_config()` with `true` (third parameter):**
- Transaction-scoped — automatically resets on commit/rollback
- No connection pool leakage — each request gets clean state
- Common pattern in Neon RLS examples
- Equivalent to `SET LOCAL` but more explicit

**Transaction ownership:**
- `hasTenantAccess` middleware calls `withTenantContext` and stores `tx` in Hono context
- Handlers receive `tx` from context, not raw `db`
- Ensures all handler queries run within the RLS-configured transaction

**Tenant resolved from URL, not derived from data:**
- RLS is active BEFORE any tenant-scoped queries
- No pre-RLS data access that could be exploited
- Tenant context is explicit, not trusted from database rows

### Database roles

Split runtime and admin roles:

| Role | Privileges | RLS Behavior |
|------|------------|--------------|
| `cella_runtime` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables | Subject to RLS policies |
| `cella_admin` | Full DDL, `BYPASSRLS` | Skips RLS for migrations, seeding |

Configuration:

```typescript
// config/default.ts
export default {
  DATABASE_URL: '...', // cella_runtime role
  DATABASE_ADMIN_URL: '...', // cella_admin role (migrations, seeds)
}
```

### Connection access pattern (`unsafeInternal` prefix)

DB connections are exported with `unsafeInternal` prefix to signal danger:

```typescript
// backend/src/db/index.ts

// DANGER: Direct db access bypasses middleware-provided context
// Only use for scripts, migrations, and explicit admin handlers
export const unsafeInternalDb = drizzle(...);
export const unsafeInternalAdminDb = drizzle({ ... }); // BYPASSRLS role

// Handlers should NEVER import these directly - use context-provided tx
```

**Middleware provides correct connection:**

```typescript
// In hasTenantAccess middleware
const tx = await withTenantContext(unsafeInternalDb, {
  tenantId,
  userId,
  isAuthenticated,
}, async (tx) => {
  c.set('db', tx);  // Handlers use this
  return await next();
});
```

**Handler pattern:**

```typescript
// Handler - clean, no db imports needed
app.get('/orgs', async (c) => {
  const db = c.get('db');  // Already tenant-scoped
  return db.select().from(organizations);
});
```

**Benefits of `unsafeInternal` pattern:**
- Single control point — middleware decides connection/transaction
- Fail-safe default — handlers can't accidentally use wrong connection
- Obvious escape hatch — grep for "unsafeInternal" in code review
- Policies stay strict — no inline admin bypass clauses

**When to use `unsafeInternalAdminDb`:**
- Migrations and seeds
- System admin endpoints (tenant management)
- Background jobs needing cross-tenant access
- Always explicit in handler, never injected via middleware

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

Replace `hasOrgAccess` with `hasTenantAccess`:

1. Extract `tenantId` from URL path parameter
2. Validate format (6-char alphanumeric)
3. Validate user has membership in this tenant (check memberships from auth)
4. Set `tenant` in Hono context
5. Wrap handler in transaction with session variables

Flow:

```
Request: GET /:tenantId/:orgIdOrSlug/attachments
    ↓
isAuthenticated (sets: user, memberships)
    ↓
hasTenantAccess (validates tenantId from URL, sets: tenant)
    ↓
hasOrgAccess (validates org belongs to tenant, sets: organization)
    ↓
withTenantContext (set_config: app.tenant_id, app.user_id, app.is_authenticated)
    ↓
Handler (receives tx via c.get('db'), all queries automatically tenant-scoped via RLS)
```
Handler (all queries automatically tenant-scoped via RLS)
```

For public routes:

```
Request: GET /public/:tenantId/attachments/:id
    ↓
hasTenantAccess (validates tenantId from URL, no auth required)
    ↓
withTenantContext (set_config: app.tenant_id, app.is_authenticated = false)
    ↓
Handler (RLS allows only is_public = true rows)
```

### Cross-tenant queries

For users with memberships across multiple tenants (e.g., global search):

```typescript
async function queryAcrossTenants<T>(
  userId: string,
  queryFn: (tenantId: string) => Promise<T[]>
): Promise<T[]> {
  // Get user's authorized tenants
  const memberships = await getContextMemberships();
  const tenantIds = [...new Set(memberships.map(m => m.tenantId))];
  
  if (tenantIds.length === 0) {
    throw new Error('No authorized tenants');
  }
  
  // Query each tenant in parallel with proper context
  const results = await Promise.all(
    tenantIds.map(async (tenantId) => {
      return withTenantContext(unsafeInternalDb, {
        tenantId,
        userId,
        isAuthenticated: true,
      }, async (tx) => queryFn(tenantId));
    })
  );
  
  // Merge and return with tenant tags
  return results.flat();
}
```

### CDC changes

Minimal changes required:

- Activities table includes `tenantId` column
- CDC Worker parses `tenantId` from activity rows
- ActivityBus routes by `tenantId` (or `organizationId` within tenant)
- SSE subscriptions include tenant context

### Security hardening

#### Tenant ID validation

Treat tenant IDs as untrusted input:

```typescript
const TENANT_ID_REGEX = /^[a-zA-Z0-9]{6}$/; // 6-char alphanumeric

function validateTenantId(id: string): void {
  if (!TENANT_ID_REGEX.test(id)) {
    throw new Error('Invalid tenant ID format');
  }
}
```

### SQL identifier escaping

All dynamic SQL uses proper escaping:

```typescript
// Always use sql.identifier() for identifiers
await db.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);

// Never string concatenation
// BAD: sql.raw(`SET LOCAL app.tenant_id = '${tenantId}'`)
```

### Database privilege lockdown

One-time migration to secure defaults:

```sql
-- Revoke public schema creation
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Revoke default privileges
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Grant only to runtime role
GRANT USAGE ON SCHEMA public TO cella_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cella_runtime;
```

### Tenant deletion workflow

Two-step deletion for safety:

1. Set `status = 'archived'`
2. After delay (e.g., 7 days), admin job deletes data:
   - Verify tenant exists and is in `archived` status
   - Delete all rows with matching `tenantId` from tenant-scoped tables
   - Delete tenant record

### Audit logging

Log dangerous operations:

- Tenant created
- Tenant status changed
- Cross-tenant query executed
- `unsafeInternalAdminDb` used (system admin endpoints)

### Security regression tests

Automated tests that verify tenant isolation. These are **must-have** before production:

```typescript
describe('Tenant isolation', () => {
  // Fail-closed enforcement
  it('should deny access when app.tenant_id is not set', async () => {
    // Attempt query without SET LOCAL app.tenant_id
    // Assert: no rows returned (fail-closed)
  });

  it('should deny access when app.tenant_id is empty string', async () => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ''`);
    // Assert: no rows returned
  });

  // Cross-tenant read protection
  it('should not return data from other tenants', async () => {
    // Create data in tenant A
    // Set context to tenant B
    // Assert: no rows from tenant A visible
  });

  // Cross-tenant write protection
  it('should block INSERT with tenant_id != app.tenant_id', async () => {
    await tx.execute(sql`SET LOCAL app.tenant_id = 'tenantA'`);
    // Attempt insert with tenant_id = 'tenantB'
    // Assert: WITH CHECK violation error
  });

  it('should block UPDATE that changes tenant_id', async () => {
    // Create row in tenant A
    // Set context to tenant A
    // Attempt to UPDATE tenant_id to 'tenantB'
    // Assert: WITH CHECK violation error
  });

  it('should block DELETE on rows from other tenants', async () => {
    // Create row in tenant A
    // Set context to tenant B
    // Attempt DELETE
    // Assert: 0 rows affected (USING clause filters it out)
  });

  // Public content restrictions
  it('should only show is_public=true rows to unauthenticated users', async () => {
    await tx.execute(sql`SET LOCAL app.is_authenticated = 'false'`);
    // Assert: only is_public=true rows visible
  });

  it('should block writes from unauthenticated users', async () => {
    await tx.execute(sql`SET LOCAL app.is_authenticated = 'false'`);
    // Attempt INSERT/UPDATE/DELETE
    // Assert: all blocked
  });

  // Memberships cross-tenant
  it('should allow SELECT on own memberships across tenants', async () => {
    // User has memberships in tenant A and B
    // Set context with empty tenant_id but valid user_id (for /me routes)
    // Assert: can read memberships from both tenants via user_id match
  });

  it('should block SELECT on other users memberships', async () => {
    // Set user_id context to user A
    // Attempt to read user B's memberships
    // Assert: no rows returned
  });

  it('should block INSERT membership in other tenant', async () => {
    await tx.execute(sql`SET LOCAL app.tenant_id = 'tenantA'`);
    // Attempt insert membership with tenant_id = 'tenantB'
    // Assert: WITH CHECK violation
  });

  it('should block UPDATE membership in other tenant', async () => {
    // Membership exists in tenant B
    await tx.execute(sql`SET LOCAL app.tenant_id = 'tenantA'`);
    // Attempt update
    // Assert: 0 rows affected or error
  });

  it('should block DELETE membership in other tenant', async () => {
    // Membership exists in tenant B
    await tx.execute(sql`SET LOCAL app.tenant_id = 'tenantA'`);
    // Attempt delete
    // Assert: 0 rows affected
  });

  // Connection pool leakage
  it('should not leak tenant context across requests on pooled connection', async () => {
    // Request 1: Set tenant A, query data
    // Request 2: Same connection, different tenant B
    // Assert: Request 2 cannot see tenant A data
    // Assert: app.tenant_id is not inherited from Request 1
  });
});
```

## Frontend changes

### URL structure

All org-scoped frontend routes include tenantId:

| Current | New |
|---------|-----|
| `/:orgSlug/dashboard` | `/:tenantId/:orgSlug/dashboard` |
| `/:orgSlug/attachments` | `/:tenantId/:orgSlug/attachments` |
| `/:orgSlug/members` | `/:tenantId/:orgSlug/members` |
| `/user/settings` | `/user/settings` (unchanged) |
| `/system/...` | `/system/...` (unchanged) |

**TenantId is visible in browser URL** — short 6-char format keeps URLs clean.

### Route changes

Update TanStack Router route tree:

```typescript
// Before
const orgRoute = createRoute({
  path: '/$orgSlug',
  // ...
});

// After
const tenantRoute = createRoute({
  path: '/$tenantId',
  // ...
});

const orgRoute = createRoute({
  getParentRoute: () => tenantRoute,
  path: '/$orgSlug',
  // ...
});
```

### Navigation and links

All tenant-scoped navigation includes tenantId

```typescript
// Before
navigate({ to: '/$orgSlug/attachments', params: { orgSlug } });

// After
navigate({ to: '/$tenantId/$orgSlug/attachments', params: { tenantId, orgSlug } });
```

### API client

Frontend API calls include tenantId prefix and organization is not a naked path part anymore.

```typescript
// Before
GET /acme-corp/attachments

// After
GET /x7Kp2m/organization/acme-corp/attachments
```

TenantId extracted from current route params.

### System routes

Add tenants management to system panel:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/system/tenants` | `TenantsTable` | List and manage tenants |

Clicking tenant opens sheet with organizations in that tenant.

### New modules

| Module | Location | Purpose |
|--------|----------|---------|
| Backend tenants | `backend/src/modules/tenants/` | Routes, handlers, schema |
| Frontend tenants | `frontend/src/modules/tenants/` | TenantsTable, query |

## Seed changes

Update seed script to create tenant hierarchy:

- **1 default tenant** — For existing installations
- **3 tenants** — For development/testing multi-tenant scenarios
- **Organizations distributed across tenants**

## Implementation checklist

### Backend

- [ ] Create `tenants` table in `backend/src/db/schema/tenants.ts` (6-char nanoid ID, snake_case columns)
- [ ] Add `'tenant'` to `resourceTypes` in shared config
- [ ] Add `tenant_id` column to organizations, memberships, product entities, activities
- [ ] Add `is_public` column to product entities that need public access
- [ ] Create RLS policy building blocks (`tenantMatch`, `userMatch`, `isAuthenticated` helpers)
- [ ] Add RLS policies to all tenant-scoped tables (no `.withRLS()` needed when policies defined)
- [ ] Create `withTenantContext` helper in `backend/src/db/tenant-context.ts`
- [ ] Export db connections with `unsafeInternal` prefix pattern
- [ ] Create `backend/src/modules/tenants/` module (routes, handlers, schema)
- [ ] Create `hasTenantAccess` middleware using `withTenantContext`
- [ ] Update `hasOrgAccess` to validate org belongs to tenant from URL
- [ ] Update all org-scoped routes to use `/:tenantId/:orgIdOrSlug/...` pattern
- [ ] Create `/public/:tenantId/...` routes for public content
- [ ] Split database connections (runtime vs admin roles)
- [ ] Update CDC Worker to parse `tenantId`
- [ ] Add security regression tests

### Frontend

- [ ] Create `frontend/src/modules/tenants/` module
- [ ] Build TenantsTable component for system panel
- [ ] Update route tree: add `$tenantId` parent route for org routes
- [ ] Update all org-scoped route paths to `/$tenantId/$orgSlug/...`
- [ ] Update navigation helpers to include tenantId
- [ ] Update API client to prefix tenantId on org-scoped calls
- [ ] Update Link components throughout app

### Database

- [ ] Generate Drizzle migration for new schema (use `drizzle-kit generate`, not `push`)
- [ ] Create `cella_runtime` and `cella_admin` roles
- [ ] Apply privilege lockdown migration
- [ ] Update seed to create tenants
- [ ] Apply migrations via `drizzle-kit migrate` in CI/prod

**Note:** Prefer `drizzle-kit generate` + `migrate` over `push` for RLS-heavy schemas — `push` has had issues applying RLS in some setups.

## Out of scope

- **Schema-per-tenant** — RLS provides isolation; schema separation adds complexity without proportional benefit
- **Database-per-tenant** — Future upgrade path if needed; tenantId column prepares for this
- **Per-tenant customization** — All tenants share identical schema
- **Tenant-specific resource limits** — PostgreSQL doesn't support per-RLS-policy limits
- **Automated tenant archival** — Manual process via status enum

## Future considerations

If stronger isolation is needed later:

| Current (RLS) | Future Option |
|---------------|---------------|
| Shared tables with RLS | Database-per-tenant with connection routing |
| `tenantId` column | Becomes database selection key |
| `tenantsTable` | Becomes tenant registry with connection strings |

The `tenantId` column and infrastructure built now prepares for this upgrade path.