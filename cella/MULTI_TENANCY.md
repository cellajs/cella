# Multi-tenancy

This document explains how tenant data stays isolated: which layer does what, and how far the [row-level security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) backstop reaches.

### TL;DR

The application keeps each tenant's data separate. It checks who makes a request, limits every query to the current
tenant and applies [permissions](./PERMISSIONS.md). PostgreSQL adds a second safety net for reads of tenant-owned
content. It catches application mistakes but is not the main access-control layer.

## Security contract

Authorization must stay correct with RLS absent or misconfigured. Removing RLS broadens no application query. Every entity lookup compares the row's tenant and organization with the request scope. Every organization-bound product query carries a tenant and organization predicate.

The backend suite proves it by running twice with identical expectations: once with RLS bypassed, once as the RLS-bound runtime role ([Verification](#verification)).

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

## What RLS covers

RLS is enabled on product tables and on resources that hold tenant data. The owning `admin_role` bypasses it, since it is never forced ([Database roles](#database-roles)). The template protects `attachments`, `yjs_documents` and `yjs_updates`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| Product entities | Tenant-scoped SELECT, permissive writes | Guards, scoped queries, and permissions |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Resources | RLS only when they hold tenant data and the migration lists them | Owning module and guards |

The RLS migration protects every registered product table without per-table opt-in. Every product entity has a tenant and a home channel: the hierarchy rejects a product without a channel parent. Channel-entity and membership queries use `baseDb`. Product reads must enter a tenant helper.

## Product reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction that names the tenant to the RLS policies. A protected read without one returns nothing. Pick by what the work does:

- `tenantRead` for a request's product reads.
- `tenantContext` for a request's creates and updates.
- `tenantReadById` for work with no request behind it, such as notification fan-out.
- `tenantReadAs` for a route without `tenantGuard`, which names the tenant explicitly.

Variants also read tombstones. Database work stays inside the callback. A helper called inside a tenant transaction for the same tenant joins it as a savepoint. One for another tenant is refused.

## Write-through policies

The RLS migration installs INSERT, UPDATE and DELETE policies whose expressions are `true`. **The write policy supplies no authorization.** Permissions stay in the shared engine, and a contextless insert passes RLS.

| Concern | Mechanism | Limit |
| --- | --- | --- |
| Actor may perform the action | Guards and the permission engine | Every mutation path must call them |
| Initial tenant and organization | The server derives them from the guarded context | A contextless SQL insert is outside this protection |
| Update or delete targets | The operation's query uses guarded ids and channel scope | RLS write policies add no predicates |
| Tenant and organization agree | A composite `(tenant_id, organization_id)` foreign key on every organization-bound table. Tenant and organization are 1:1. | Does not authorize the actor |
| Product identity cannot move | A trigger makes `tenant_id` and `organization_id` immutable after insert | Does not validate the insert. Deeper ancestor ids are not covered. |
| Membership identity, activities | Immutability triggers on membership identity columns. Activity rows are append-only for the runtime role. | Same limits. `admin_role` can delete activities. |

## Database roles

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | Bypassed as table owner | Migrations, seeds, the pg_cron partition job, and CDC replication or stamping |

`admin_role` also owns the activities. Its bypass never depends on the `BYPASSRLS` attribute, which managed providers such as Scaleway cannot grant. The dev and test roles are created without it to match. Migrations grant `runtime_role` what the application needs. They refuse to run when either role is missing.

Only the admin connection can write `system_roles`. A system admin of the app is not `admin_role`. Their requests use the runtime connection and normal request scope.

The admin credential serves migrations, seeds and job setup. An API that runs none of them serves without it. Its request handlers then cannot reach an RLS-bypassing connection. Never call `getAdminDb()` from a request handler.

## Tenant kinds

A tenant's `kind` says what it is for, and `appConfig.tenantKinds` says what each kind takes part in:

- **`live`.** It serves customers.
- **`test`.** Staff and automated runs, kept out of public counts and behind a filter in admin lists.
- **`demo`.** A visitor's throwaway, which only `createDemo` makes while `has.demos` is on.

A system admin moves a tenant between `live` and `test`.

A demo holds one account, admin of the tenant's organization, under a placeholder address with no proven inbox. Only a `demo` session signs it in. The app's `onDemoCreated` hooks fill it with content. It expires after `retention.demoTenantDays`. A demo invites no one, since that mails third parties. Its session is refused when it would:

- create a tenant
- add a sign-in method
- prove an address
- hand out lasting access

## Tenant lifecycle

A tenant is `active`, `suspended` or `archived`. `tenantGuard` refuses every request to a tenant that is not active or is past its `expiresAt`. The refusal counts at once in the process that changed the status, and within seconds in any other.

Deleting its organization archives a tenant. A system admin also archives one when a contract ends. The organization then leaves every member's memberships and lists. Their open streams end, so their apps drop it.

A system admin restores a tenant by setting it active again. Once its archived period or its expiry passes, an hourly sweep removes the tenant with everything in it. The provisional accounts it leaves with no membership go too.

## Verification

- Builders: `backend/src/db/rls-helpers.ts`.
- Migration `10-rls`: sets classification, ownership, RLS and grants.
- Migration `99-verify`: asserts that end state, and a failed assertion rolls the migration back.
- `rls-security.test.ts` and `schema-verification.test.ts`: inspect the migrated catalog, never repair it.
- `backend/tests/security/cross-tenant.test.ts` and `cross-org.test.ts`: attack the boundary.
- `pnpm test:core:runtime`: the runtime-role run.
