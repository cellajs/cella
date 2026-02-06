Below is an updated **full plan** with **Drizzle v1 patterns**, **Neon best-practice alignment**, and **security hardening**. I’m keeping it **Copilot-friendly**: consistent naming, “fail closed”, and using Drizzle RLS helpers where they actually fit.

References:
Drizzle v1 RLS API details : https://orm.drizzle.team/docs/rls
 Neon “Simplify RLS with Drizzle / crudPolicy” guidance : https://neon.com/docs/guides/rls-drizzle

---

# Tenant isolation with PostgreSQL RLS (Drizzle v1 + Neon patterns)

## Goals 

* Database-enforced tenant boundaries via Postgres RLS.
* All tenant-scoped tables have a required `tenant_id`.
* Tenant context is set **before** any tenant query (from URL).
* Admin/migrations use a separate role/connection.
* Public rows allowed only via `is_public = true` (read-only).
* Cross-tenant membership listing supported safely (`/me/memberships`).

---

## Key security improvements 

### A) Fail closed (mandatory)

* All RLS expressions must deny access when `app.tenant_id` is missing/empty.
* Do **not** rely on SQL operator precedence; always use parentheses.

### B) Separate policies per operation (recommended)

* Use separate `SELECT / INSERT / UPDATE / DELETE` policies.
* Always use `WITH CHECK` on `INSERT` and `UPDATE` to prevent writing to other tenants.

### C) Prefer role-based admin bypass

* Avoid trusting a boolean `app.is_system_admin` as the *only* bypass.
* Use an **admin role/connection** with `BYPASSRLS` for migrations/system jobs.
* If you keep app-level “system admin” access for runtime endpoints, gate it in the **application** and still keep RLS strict.

### D) Don’t let “memberships cross-tenant” enable writes

* Cross-tenant visibility for memberships should be **SELECT only**.
* Writes remain strictly tenant-scoped.

---

## Drizzle v1 RLS rules you must follow

* **If you add policies, RLS is enabled automatically**; you do **not** need `.enableRLS()` or `pgTable.withRLS()` in those tables. ([orm.drizzle.team][1])
* `pgTable.withRLS()` is only for “enable RLS without policies”. ([orm.drizzle.team][1])
* Define policies inside the `pgTable(..., (table) => [ pgPolicy(...) ])` callback. ([orm.drizzle.team][1])

---

## Naming convention (important for RLS correctness)

Use **snake_case DB column names** for anything referenced in policies:

* `tenant_id`, `user_id`, `is_public`, etc.
* In Drizzle, alias them explicitly:

```ts
tenantId: varchar('tenant_id', { length: 6 }).notNull()
```

This avoids accidental `"tenantId"` quoting problems.

---

## Schema: tenants table (system resource)

* `tenants` table is not an entity; no CRUD routes.
* ID is `varchar(6)` nanoid.

```ts
export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 6 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: pgEnum('tenant_status', ['active', 'suspended', 'archived'])('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## Tenant-scoped tables

Tenant-scoped tables must include `tenant_id NOT NULL REFERENCES tenants(id)`:

* `organizations`, `memberships`, `attachments`, `activities`, etc.
* `pages` (your “publicProductEntityTypes”) stays **non-tenant-scoped** (user-scoped) unless you change the product model.

---

## Session/transaction protocol (server-side, not Data API)

Your plan to use `SET LOCAL` is correct. Keep it.

### “Set context” helper (recommended)

Create one helper to ensure context is always set the same way:

```ts
export async function withTenantContext<T>(
  db: Db,
  ctx: {
    tenantId: string;          // '' for /me routes
    userId: string | null;     // null for public
    isAuthenticated: boolean;
  },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', ${ctx.isAuthenticated ? 'true' : 'false'}, true)`);
    return fn(tx);
  });
}
```

Why `set_config` instead of `SET LOCAL`?

* Same effect (transaction scoped) and common in Neon RLS examples when working with per-request claims. ([Neon][2])
  (You can keep `SET LOCAL` if you prefer; just be consistent.)

---

## RLS policy building blocks (shared)

**Fail-closed tenant predicate** (copy/paste):

```ts
const tenantCtxSet = sql`COALESCE(current_setting('app.tenant_id', true), '') <> ''`;

const isAuthed = sql`current_setting('app.is_authenticated', true)::boolean = true`;

const tenantMatch = (t: { tenantId: any }) => sql`
  ${tenantCtxSet}
  AND ${t.tenantId} = current_setting('app.tenant_id', true)::text
`;
```

---

## Standard tenant isolation policies (no public access)

Use operation-specific policies. Drizzle v1 pattern:

```ts
import { pgTable, pgPolicy, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const organizations = pgTable('organizations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  // ...
}, (t) => [
  pgPolicy('org_select', {
    for: 'select',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('org_insert', {
    for: 'insert',
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('org_update', {
    for: 'update',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`, // prevents changing tenant_id
  }),
  pgPolicy('org_delete', {
    for: 'delete',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
]);
```

Notes:

* This is “strict RLS”; admin bypass is via **admin role/connection**, not a boolean.
* If you truly need runtime “system admin” endpoints, handle that by using `adminDb` for those endpoints (or a dedicated role with controlled access).

---

## Public-aware policies (read-only public)

For tables with `is_public`:

* Public users can `SELECT` only if `is_public=true`.
* Writes require auth and tenant match.

```ts
const isPublic = (t: { isPublic: any }) => sql`${t.isPublic} = true`;

export const attachments = pgTable('attachments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  isPublic: boolean('is_public').notNull().default(false),
  // ...
}, (t) => [
  pgPolicy('att_select', {
    for: 'select',
    using: sql`
      (${tenantMatch(t)})
      AND ( (${isAuthed}) OR (${isPublic(t)}) )
    `,
  }),
  pgPolicy('att_insert', {
    for: 'insert',
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('att_update', {
    for: 'update',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('att_delete', {
    for: 'delete',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
]);
```

---

## Memberships policies (cross-tenant SELECT only)

Goal: `/me/memberships` can list memberships across tenants for the current user.

**Important hardening**: cross-tenant exception is only on `SELECT`.

```ts
const userCtxSet = sql`COALESCE(current_setting('app.user_id', true), '') <> ''`;
const userMatch = (t: { userId: any }) => sql`
  ${userCtxSet}
  AND ${t.userId} = current_setting('app.user_id', true)::text
`;

export const memberships = pgTable('memberships', {
  id: varchar('id', { length: 255 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 6 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 255 }).notNull(),
  // ...
}, (t) => [
  // Cross-tenant SELECT for “my memberships”
  pgPolicy('m_select', {
    for: 'select',
    using: sql`
      (${isAuthed})
      AND (
        (${tenantMatch(t)}) OR (${userMatch(t)})
      )
    `,
  }),

  // Writes remain tenant-scoped only
  pgPolicy('m_insert', {
    for: 'insert',
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('m_update', {
    for: 'update',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
    withCheck: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
  pgPolicy('m_delete', {
    for: 'delete',
    using: sql`(${tenantMatch(t)}) AND (${isAuthed})`,
  }),
]);
```

---

## Neon “crudPolicy” guidance (when to use it)

Neon recommends Drizzle to declare policies and highlights the `crudPolicy` helper to avoid repeating CRUD boilerplate. ([Neon][2])

**However:** `crudPolicy` and helpers like `authenticatedRole/anonymousRole/authUid` are primarily aligned with **Neon Data API** patterns (JWT → `auth.user_id()`), not your current “app.* session vars” approach. ([Neon][2])

**Recommendation:**

* Keep `pgPolicy` for tenant isolation with `app.tenant_id`.
* If you later expose the DB via Neon Data API, consider adding **additional** policies using `crudPolicy` and `auth.user_id()` patterns for direct client access.

---

## Middleware routing rules (security-critical)

### Tenant routes

* `/:tenantId/:orgIdOrSlug/...` (auth required)
* Validate `tenantId` format `^[a-zA-Z0-9]{6}$`
* Verify membership to tenant **before** calling `withTenantContext(...)`

### Public routes

* `/public/:tenantId/...` (no auth)
* Set `isAuthenticated=false`, `userId=null`
* Still set tenant context so RLS can enforce `tenant_id` match

### /me routes

* `/me/...` (auth required)
* For `/me/memberships` you can set `tenantId=''` (fail-closed for tenant tables), and rely on `user_id` select policy for memberships.
* Do not allow other tenant-scoped tables under `/me` unless explicitly designed.

---

## DB roles & migrations (Drizzle + security)

* `cella_runtime`: only DML on needed tables; **no BYPASSRLS**
* `cella_admin`: migration/seeding role; has `BYPASSRLS` and DDL privileges

Drizzle v1 supports defining roles in schema via `pgRole`, and marking existing roles as `.existing()` when you don’t want migrations to create them. ([orm.drizzle.team][1])

---

## Migrations workflow (recommended)

* Use `drizzle-kit generate` to create SQL migrations and commit them.
* Use `drizzle-kit migrate` to apply them in CI/prod.
* Avoid relying on `push` for RLS-heavy schemas (it has had real-world issues applying RLS in some setups). ([GitHub][3])

---

## Tests (must-have)

Automate these:

* Missing `app.tenant_id` returns **0 rows** for tenant-scoped tables.
* Cross-tenant read returns **0 rows**.
* Insert/update with mismatched `tenant_id` fails via `WITH CHECK`.
* Public route can only read `is_public=true`.
* Memberships cross-tenant: SELECT works, write blocked without tenant match.
* Pool leakage: request A tenant != request B tenant → no bleed.

---

## Implementation checklist (updated)

### Backend

* [ ] Add `tenants` table
* [ ] Add `tenant_id NOT NULL` to tenant-scoped tables
* [ ] Replace `.enableRLS()` usage; rely on policies to enable RLS (or `pgTable.withRLS` only when needed) ([orm.drizzle.team][1])
* [ ] Define RLS via `pgPolicy` per table
* [ ] Wrap all handlers in `withTenantContext(tx => ...)` and pass only `tx`
* [ ] Split `db` and `adminDb`
* [ ] Update routes to include `/:tenantId/...` and `/public/:tenantId/...`

### Database

* [ ] Create `cella_runtime`, `cella_admin` roles and grants
* [ ] Revoke default privileges; grant only required privileges to runtime
* [ ] Commit generated migrations; deploy via `migrate`

---
