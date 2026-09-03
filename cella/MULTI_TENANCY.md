# Multi-tenancy

This document explains how tenant data stays isolated: which layer is responsible for what, and how far the database backstop reaches.

### TL;DR

The application is responsible for keeping each tenant's data separate: it checks who is making a
request, limits every query to the current tenant, and applies [permissions](./PERMISSIONS.md).
PostgreSQL adds a second safety net for reads of tenant-owned content. It catches application
mistakes but is not the main access-control layer.

## Security contract

Authorization must stay correct with RLS absent or misconfigured: API tests run as a role that
bypasses RLS and must give the same allow or deny results as production.

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

Per-operation checks: [Enforcement paths](./PERMISSIONS.md#enforcement-paths).

## What RLS covers

Cella applies `FORCE ROW LEVEL SECURITY` to tenant-scoped product tables and the support tables the
RLS migration lists; the template protects `attachments` and `yjs_documents`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| RLS-classified product entities | Tenant-scoped SELECT; permissive writes | Guards, scoped queries, and permissions |
| Listed tenant support tables | Same RLS shape; `yjs_documents` in the template | Owning module and guards |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Ordinary resources | No RLS unless the migration lists them | Owning route or module |

The migration classifier takes registered entity tables, removes `user` and the channel types, then
adds the listed support tables, so a registered product entity is protected automatically.
Channel-entity and membership queries use `baseDb`; protected product reads must enter a tenant helper.

## Product reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction and set transaction-local
variables before product queries:

| Variable | Current RLS effect |
| --- | --- |
| `app.tenant_id` | Required tenant match for protected SELECTs; missing or empty fails closed |
| `app.include_deleted` | Makes soft-deleted rows visible to explicit tombstone and delta reads |
| `app.user_id` | Available to the transaction; current RLS policies do not consult it |

### Transaction helpers

| Helper | Transaction | Use it for |
| --- | --- | --- |
| `tenantRead(ctx, fn)` | Read only, live rows | Normal protected product reads |
| `tenantReadIncludingDeleted(ctx, fn)` | Read only, includes tombstones | Delta and recovery reads |
| `tenantContext(ctx, fn)` | Read/write, live rows | Creates and ordinary updates |
| `tenantContextIncludingDeleted(ctx, fn)` | Read/write, includes tombstones | Soft-delete and restore flows |
| `tenantReadAs(ctx, tenantId, fn)` | Read only, explicit tenant | Cross-tenant routes |
| `tenantReadById(tenantId, fn)` | Read only, no request context | Background work such as notification fan-out |

Helpers that take a request context pass a clone whose `db` is the transaction; `tenantReadById`
passes the raw transaction. Database work stays inside the callback.

## Write-through policies

Cella installs INSERT, UPDATE, and DELETE policies whose expressions are `true`, since RLS denies
operations without a policy. **The write policy supplies no authorization**: permissions stay in
the shared engine, and a contextless insert passes RLS.

| Concern | Mechanism | Limit |
| --- | --- | --- |
| Actor may perform the action | Guards and shared permission engine | Must be called by every mutation path |
| Initial tenant and root channel | Server derives identity from guarded context | A contextless SQL insert is outside this protection |
| Update or delete targets | Operation query uses guarded IDs and channel scope | RLS write policies add no predicates; SELECT-policy hiding of validation reads or `RETURNING` is not a write-security contract |
| Tenant and root channel agree | Composite foreign key such as `(tenant_id, organization_id)` | Does not authorize the actor |
| Product identity cannot move | Shared product trigger makes `tenant_id` and root channel immutable after insert | Does not validate the insert; deeper ancestor IDs not covered |
| Membership identity, activity log | Immutability triggers on membership identity columns; activity rows cannot be updated, and `runtime_role` has no delete grant on them | Same limits; `admin_role` can delete activities |

## Database roles

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | `BYPASSRLS` in the supported production setup | Migrations, seeds, maintenance, and CDC replication or stamping |

`admin_role` owns the RLS-protected tables and the activity log; migrations grant `runtime_role` what
the application needs. Role creation falls back to an `admin_role` without `BYPASSRLS` on providers
that refuse the attribute, with only a notice, so check the role on a new provider. An application
system administrator is not `admin_role`; their requests use the runtime connection and normal
request scope. Never use the admin connection in a request handler; it removes the RLS backstop.

## Verification

Builders and helpers: `backend/src/db/rls-helpers.ts`, `tenant-context.ts`, `immutability-triggers.ts`; migrations `10-rls` (classification, ownership, forced RLS, grants) and `99-verify` (generated checks); tests `backend/tests/integration/rls-security.test.ts`, `schema-verification.test.ts`, `backend/tests/security/cross-tenant.test.ts`, `cross-org.test.ts`.
