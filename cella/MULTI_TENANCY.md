# Multi-tenancy

This document explains how tenant data stays isolated: which layer is responsible for what, and how far the database backstop reaches.

### TL;DR

The application is responsible for keeping each tenant's data separate: it checks who is making a
request, limits every query to the current tenant, and applies [permissions](./PERMISSIONS.md).
PostgreSQL adds a second safety net for reads of tenant-owned content. It catches application
mistakes but is not the main access-control layer.

## Security contract

Authorization must stay correct with RLS absent or misconfigured. The backend suite runs twice:
as a superuser (RLS bypassed) and as the RLS-subject `runtime_role` (`pnpm test:core:runtime`),
with identical expectations. Every entity lookup compares the row's tenant and organization ids
with the request scope (`getValidProduct`, `getValidChannel`), and every organization-bound product
query carries `requestScopeWhere` (tenant + organization predicate), so removing RLS broadens no
application query.

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

Per-operation checks: [Enforcement paths](./PERMISSIONS.md#enforcement-paths).

## What RLS covers

Cella enables row-level security on product tables and on resources that hold tenant data, and never
forces it: `admin_role` owns those tables, so it bypasses the policies as the owner while `runtime_role`
is filtered. The template protects `attachments` and `yjs_documents`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| Product entities | Tenant-scoped SELECT, permissive writes | Guards, scoped queries, and permissions |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Resources | RLS only when they hold tenant data and the migration lists them (`yjs_documents`), none otherwise | Owning module and guards |

Every product entity has a tenant and a home channel by construction (the hierarchy rejects a
product without a channel parent), so the RLS migration protects every registered product table
without per-table opt-in. Channel-entity and membership queries use `baseDb`. Product reads must
enter a tenant helper.

## Product reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction and set transaction-local
variables before product queries:

| Variable | Current RLS effect |
| --- | --- |
| `app.tenant_id` | Required tenant match for protected SELECTs. Missing or empty fails closed. |
| `app.include_deleted` | Makes soft-deleted rows visible to explicit tombstone and delta reads |
| `app.user_id` | Available to the transaction. Current RLS policies do not consult it |

### Transaction helpers

| Helper | Transaction | Use it for |
| --- | --- | --- |
| `tenantRead(ctx, fn)` | Read only, live rows | Normal protected product reads |
| `tenantReadIncludingDeleted(ctx, fn)` | Read only, includes tombstones | Delta and recovery reads |
| `tenantContext(ctx, fn)` | Read/write, live rows | Creates and ordinary updates |
| `tenantContextIncludingDeleted(ctx, fn)` | Read/write, includes tombstones | Soft-delete and restore flows |
| `tenantReadAs(ctx, tenantId, fn)` | Read only, explicit tenant | Cross-tenant routes |
| `tenantReadById(tenantId, fn)` | Read only, no request context | Background work such as notification fan-out |

Helpers that take a request context pass a clone whose `db` is the transaction. `tenantReadById`
passes the raw transaction. Database work stays inside the callback.

## Write-through policies

Cella installs INSERT, UPDATE, and DELETE policies whose expressions are `true`, since RLS denies
operations without a policy. **The write policy supplies no authorization**: permissions stay in
the shared engine, and a contextless insert passes RLS.

| Concern | Mechanism | Limit |
| --- | --- | --- |
| Actor may perform the action | Guards and shared permission engine | Must be called by every mutation path |
| Initial tenant and organization | Server derives identity from guarded context | A contextless SQL insert is outside this protection |
| Update or delete targets | Operation query uses guarded IDs and channel scope | RLS write policies add no predicates. SELECT-policy hiding of validation reads or `RETURNING` is not a write-security contract |
| Tenant and organization agree | Composite `(tenant_id, organization_id)` foreign key (`organizationForeignKey`) on every organization-bound table; tenant and organization are 1:1 | Does not authorize the actor |
| Product identity cannot move | Shared product trigger makes `tenant_id` and `organization_id` immutable after insert | Does not validate the insert. Deeper ancestor IDs are not covered. |
| Membership identity, activity log | Immutability triggers on membership identity columns. Activity rows cannot be updated, and `runtime_role` has no delete grant on them | Same limits. `admin_role` can delete activities. |

## Database roles

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | Bypassed as table owner | Migrations, seeds, maintenance, and CDC replication or stamping |

`admin_role` owns the RLS-protected tables and the activity log. Migrations grant `runtime_role` what
the application needs, and refuse to run when either role is missing. The bypass never depends on the
`BYPASSRLS` attribute: managed providers such as Scaleway cannot grant it, so ownership of never-forced
tables is the one bypass that works everywhere, and the dev and test roles are created without the
attribute to mirror that. The CDC worker probes its effective capabilities at startup: an RLS table it
cannot bypass (forced, or owned by another role) or a missing `REPLICATION` is logged as an error and
marks the CDC health component unhealthy, since seq stamping would silently affect zero rows or the
replication slot could not open. An application system administrator is not `admin_role`. Their
requests use the runtime connection and normal request scope.

The admin credential (`DATABASE_ADMIN_URL`) is optional for the request-serving API: `getAdminDb()`
opens the pool on first use, only the migrate, seed, maintenance and mcp-queue paths call it, and
each fails with a clear error when the credential is absent. A process never given the credential
cannot reach an RLS-bypassing connection. Never call `getAdminDb()` from a request handler.

## Verification

- Builders and helpers: `backend/src/db/rls-helpers.ts`, `tenant-context.ts`, `immutability-triggers.ts`.
- Migrations: `10-rls` (classification, ownership, enabled RLS, grants) and `99-verify`, which asserts
  owner, RLS enabled and not forced, the four-policy contract per table (`rlsPolicyContract`), grants per
  classification, read-only tables without write privilege, and that `runtime_role` has no
  `BYPASSRLS`. A failed assertion rolls the migration back.
- Tests: `backend/tests/integration/rls-security.test.ts` and `schema-verification.test.ts` inspect
  the migrated catalog and never repair it (the global setup provisions roles before migrating and
  refuses a volume migrated without them: `pnpm docker:test:reset`). `backend/tests/security/cross-tenant.test.ts`,
  `cross-org.test.ts`; `pnpm test:core:runtime` for the runtime-role parity run.
