# Multi-tenancy

This document explains how tenant data stays isolated: which layer is responsible for what, and how far the database backstop reaches.

### TL;DR

The application is responsible for keeping each tenant's data separate: it checks who is making a
request, limits every query to the current tenant, and applies [permissions](./PERMISSIONS.md).
PostgreSQL adds a second safety net for reads of tenant-owned content. It catches application
mistakes but is not the main access-control layer.

## Security contract

Authorization must stay correct with RLS absent or misconfigured. Every entity lookup compares the row's tenant and organization with the request scope, and every organization-bound product query carries a tenant and organization predicate, so removing RLS broadens no application query.

The backend suite proves it by running twice with identical expectations: once with RLS bypassed, once as the RLS-bound runtime role ([Verification](#verification)).

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

## What RLS covers

Cella enables row-level security on product tables and on resources that hold tenant data, and never forces it, so the owning `admin_role` bypasses it ([Database roles](#database-roles)). The template protects `attachments`, `yjs_documents` and `yjs_updates`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| Product entities | Tenant-scoped SELECT, permissive writes | Guards, scoped queries, and permissions |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Resources | RLS only when they hold tenant data and the migration lists them | Owning module and guards |

Every product entity has a tenant and a home channel by construction (the hierarchy rejects a
product without a channel parent), so the RLS migration protects every registered product table
without per-table opt-in. Channel-entity and membership queries use `baseDb`. Product reads must
enter a tenant helper.

## Product reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction that names the tenant to the RLS policies; a protected read without one returns nothing. Pick by what the work does:

- `tenantRead` for a request's product reads.
- `tenantContext` for a request's creates and updates.
- `tenantReadById` for work with no request behind it, such as notification fan-out.

Variants read tombstones too (for delta reads, recovery, soft-delete and restore) or take the tenant explicitly on a route without `tenantGuard` (`tenantReadAs`). Database work stays inside the callback.

## Write-through policies

Cella installs INSERT, UPDATE, and DELETE policies whose expressions are `true`, since RLS denies
operations without a policy. **The write policy supplies no authorization**: permissions stay in
the shared engine, and a contextless insert passes RLS.

| Concern | Mechanism | Limit |
| --- | --- | --- |
| Actor may perform the action | Guards and the permission engine | Every mutation path must call them |
| Initial tenant and organization | The server derives them from the guarded context | A contextless SQL insert is outside this protection |
| Update or delete targets | The operation's query uses guarded ids and channel scope | RLS write policies add no predicates |
| Tenant and organization agree | A composite `(tenant_id, organization_id)` foreign key on every organization-bound table; tenant and organization are 1:1 | Does not authorize the actor |
| Product identity cannot move | A trigger makes `tenant_id` and `organization_id` immutable after insert | Does not validate the insert. Deeper ancestor ids are not covered. |
| Membership identity, activities | Immutability triggers on membership identity columns; activity rows are append-only for the runtime role | Same limits. `admin_role` can delete activities. |

## Database roles

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | Bypassed as table owner | Migrations, seeds, the pg_cron partition job, and CDC replication or stamping |

`admin_role` owns the RLS-protected tables and the activities, so it bypasses their policies as the owner. The bypass never depends on the `BYPASSRLS` attribute: managed providers such as Scaleway cannot grant it, and the dev and test roles are created without it to match. Migrations grant `runtime_role` what the application needs, and refuse to run when either role is missing. The CDC worker needs the same bypass.

Only the admin connection can write `system_roles`. An application system administrator is not `admin_role`: their requests use the runtime connection and normal request scope. The admin credential serves migrations, seeds and job setup, and an API that runs none of them serves without it, so its request handlers cannot reach an RLS-bypassing connection. Never call `getAdminDb()` from a request handler.

## Tenant lifecycle

A tenant is `active`, `suspended` or `archived`, and `tenantGuard` refuses every request to one that is not active: at once in the process that changed the status, within seconds in any other. Archiving is what deleting its organization does, and what a system admin does when a contract ends. The organization then leaves every member's memberships and lists, and their open streams end, so their apps drop it.

A system admin restores it by setting the tenant active again. After the archived period a nightly sweep removes the tenant with everything in it, and mails the operator what it removed.

## Verification

- Builders: `backend/src/db/rls-helpers.ts`.
- Migrations: `10-rls` sets classification, ownership, RLS and grants; `99-verify` asserts that end state, and a failed assertion rolls the migration back.
- Tests: `backend/tests/integration/rls-security.test.ts` and `schema-verification.test.ts` inspect
  the migrated catalog and never repair it. `backend/tests/security/cross-tenant.test.ts` and
  `cross-org.test.ts` attack the boundary; `pnpm test:core:runtime` is the runtime-role run.
