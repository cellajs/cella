# Multi-tenancy

This document explains how tenant data stays isolated: which layer does what, how far the [row-level security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) backstop reaches, the database roles, and a tenant's kinds and lifecycle.

### TL;DR

The application keeps each tenant's data separate. It checks who makes a request, limits every query to the current
tenant and applies [permissions](./PERMISSIONS.md). PostgreSQL adds a second safety net for reads and writes of a
tenant's content. It catches application mistakes but is not the main access-control layer.

## Security contract

The application keeps tenants apart on its own, and RLS only backs it up. Authorization must stay correct with RLS absent or misconfigured: removing RLS broadens no application query. Every entity lookup compares the row's tenant and organization with the request scope. Every organization-bound product query carries a tenant and organization predicate.

Each layer catches the other's failure across tenants, never within one:

| What fails | What happens |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| An application write names another tenant or none, RLS is active | RLS refuses the row, or the statement touches no row |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

## What RLS covers

RLS guards the tables that hold a tenant's content. The RLS migration enables it on every registered product table and on the resources that hold tenant data. The template protects `attachments`, `yjs_documents` and `yjs_updates`.

| Tables | RLS | What decides access |
| --- | --- | --- |
| Product entities | Tenant-scoped reads and writes | Guards, scoped queries, and permissions |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Resources | RLS only when they hold tenant data and the migration lists them | Their module and guards |

Every product row has a tenant and a channel it sits directly in: the hierarchy rejects a product without a channel parent.

## Tenant helpers

Product reads and writes run inside a tenant helper from `backend/src/db/tenant-context.ts`. The helper opens a transaction that names the tenant to the RLS policies. A protected read without one returns nothing, and a write without one is refused or touches no row. You pick a helper by what the work does:

- `tenantRead` for a request's product reads.
- `tenantContext` for a request's creates and updates.
- `tenantReadById` for work with no request behind it, such as notification fan-out.
- `tenantRead` with a `tenantId` for a route without `tenantGuard`, which names the tenant explicitly.

Pass `includeDeleted` to reach tombstones too. Keep all database work inside the callback. A helper called inside a tenant transaction for the same tenant joins it as a savepoint. One for another tenant is refused.

## Tenant policy

The tenant policy is the rule RLS applies to each row. Each RLS table carries one policy for every command: a statement by the runtime role reads and writes only rows of the transaction's tenant, and none without one. A table you add to RLS declares it with the builder in `backend/src/db/rls-helpers.ts`. **The policy checks the tenant, never the actor.** Permissions stay in the permission engine.

A written row passes the same check as a read one. A soft delete writes a tombstone, so you run it with `includeDeleted`.

The policy works beside guards, foreign keys and triggers:

| What must hold | What holds it | What it leaves open |
| --- | --- | --- |
| Actor may perform the action | Guards and the permission engine | Every mutation path must call them |
| Initial tenant and organization | The server derives them from the guarded context, and the policy refuses a row of another tenant | The policy trusts the tenant the transaction names |
| Update or delete targets | The operation's query uses guarded ids and channel scope, and the policy keeps the statement inside its tenant | Channel scope inside a tenant is the application's |
| Tenant and organization agree | A composite `(tenant_id, organization_id)` foreign key on product and membership tables. Tenant and organization are 1:1. | Does not authorize the actor |
| A channel reference stays in its tenant | A composite `(tenant_id, <channel>_id)` foreign key on every column that names a channel below the organization: product ancestors, a channel's own ancestors, and the membership, invitation and LTI channel columns | Host id arrays and polymorphic ids (`channel_id`, `entity_id`) are not covered. A null id is not checked. |
| Product identity cannot move | A trigger makes `tenant_id` and `organization_id` immutable after insert | Does not validate the insert. An ancestor below the organization may change, inside the tenant. |
| Membership identity, history | Immutability triggers on membership identity columns. A trigger refuses the runtime role on `system_roles`, `activities`, `sync_state` and `sync_incidents`, whatever its grants. | `admin_role` can delete activities. A `TRUNCATE` under a reopened grant fires no row trigger. |

## Database roles

Requests run as a role that RLS binds. Work that must see every tenant, such as migrations and CDC, runs as a role that bypasses it.

| Role | RLS | Used by |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled services using the runtime connection |
| `admin_role` | Bypassed as table owner | Migrations, seeds, the nightly retention job, and CDC replication or stamping |

A system admin of the app is not `admin_role`: their requests use the runtime connection and normal request scope.

You can leave the admin connection out of an API that runs no migrations, seeds or retention. Its request handlers then cannot reach an RLS-bypassing connection. Never call `getAdminDb()` from a request handler.

## Tenant kinds

A tenant's `kind` says what it is for, and you set in `appConfig.tenantKinds` what each kind takes part in:

- **`live`:** serves customers.
- **`test`:** staff and automated runs, kept out of public counts and behind a filter in admin lists.
- **`demo`:** a visitor's throwaway, which only `createDemo` makes while `has.demos` is on.

A system admin moves a tenant between `live` and `test`.

A demo holds one [anonymous account](./ANONYMOUS_SESSIONS.md), admin of the tenant's organization. Your app fills it with content through its `onDemoCreated` hooks. It expires after `retention.demoTenantDays`. A demo invites no one: an invitation would mail third parties.

## Tenant lifecycle

A tenant's status decides whether requests reach it. A tenant is `active`, `suspended` or `deleted`. `tenantGuard` refuses every request to a tenant that is not active or is past its `expiresAt`. The refusal counts at once in the process that changed the status, and within seconds in any other.

Deleting its organization marks a tenant deleted. A system admin also marks one deleted when a contract ends. The organization then leaves every member's memberships and lists. Their open streams end, so their apps drop it.

A system admin restores a tenant by setting it active again. Once its deleted-tenant period or its expiry passes, a sweep removes the tenant with everything in it.

## Verification

The migrations set the boundary up and assert it, and the tests inspect and attack it:

- Migration `10-rls`: sets the boundary up.
- Migration `99-verify`: asserts the state `10-rls` leaves, and a failed assertion rolls the migration back.
- `rls-security.test.ts` and `schema-verification.test.ts`: inspect the migrated catalog, never repair it.
- `backend/tests/security/cross-tenant.test.ts` and `cross-org.test.ts`: attack the boundary.
- `pnpm test:core:runtime`: the runtime-role run.
