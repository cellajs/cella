# Multi-tenancy

This document explains how tenant data stays isolated: which layer is responsible for what, and how far the database backstop reaches.

### TL;DR

The application is responsible for keeping each tenant's data separate: it checks who is making a
request, limits every query to the current tenant, and applies [permissions](./PERMISSIONS.md).
PostgreSQL adds a second safety net for reads of tenant-owned content. It catches application
mistakes but is not the main access-control layer.

## Security contract

Authorization must stay correct with RLS absent or misconfigured: every API or worker path gives
the same allow or deny result through a test role that bypasses RLS.

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still deny |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

By layer: guards establish the actor and validate tenant and channel entry; the permission engine
decides whether the actor may act on a subject; scoped queries limit candidates to tenant, channel,
and readable row scope; RLS rejects cross-tenant product reads when application tenant scope is
wrong or missing; foreign keys, unique constraints, and triggers reject inconsistent identities,
duplicates, and identity changes. Per-operation checks: [Enforcement paths](./PERMISSIONS.md#enforcement-paths).

## What RLS covers

Cella applies `FORCE ROW LEVEL SECURITY` to tenant-scoped product tables and registered support
tables; the template protects `attachments` and `yjs_documents`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| RLS-classified product entities | Tenant-scoped SELECT; permissive writes | Guards, scoped queries, and permissions |
| Registered tenant support tables | Same RLS shape; `yjs_documents` is the default | Owning module and guards |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Ordinary resources | No RLS unless explicitly registered | Owning route or module |

The migration classifier takes registered entity tables, removes `user`, configured channel types,
and explicit exclusions such as `pages`, then adds configured support tables, so a registered product
entity is protected automatically. Channel-entity and membership queries use `baseDb`; protected
product reads must enter a tenant helper; a contextless `baseDb` query returns no protected rows.

## Product reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction and set transaction-local
variables before product queries:

| Variable | Current RLS effect |
| --- | --- |
| `app.tenant_id` | Required tenant match for protected SELECTs; missing or empty fails closed |
| `app.include_deleted` | Makes soft-deleted rows visible to explicit tombstone and delta reads |
| `app.user_id` | Available to the transaction; current RLS policies do not consult it |

The SELECT policy requires a non-empty tenant context equal to the row's `tenant_id`; a wrong or
missing tenant yields zero rows. RLS stops at the tenant boundary: organization and deeper channel
boundaries stay with guards, permission predicates, and query scope.

### Transaction helpers

| Helper | Transaction | Use it for |
| --- | --- | --- |
| `tenantRead(ctx, fn)` | Read only, live rows | Normal protected product reads |
| `tenantReadIncludingDeleted(ctx, fn)` | Read only, includes tombstones | Delta and recovery reads |
| `tenantContext(ctx, fn)` | Read/write, live rows | Creates and ordinary updates |
| `tenantContextIncludingDeleted(ctx, fn)` | Read/write, includes tombstones | Soft-delete and restore flows |

Each helper passes a cloned request context whose `db` is the transaction; database work stays
inside the callback.

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
| Membership identity, activity log | Immutability triggers on membership identity columns; append-only activity log | Same limits |
| Duplicate identity is rejected | Primary keys and unique constraints | Does not establish tenant ownership |
| Support tables such as `yjs_documents` | Owning module's foreign keys, query scope, update privileges, constraints | No automatic product triggers |

## Database roles

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | `BYPASSRLS` in the supported production setup | Migrations, seeds, maintenance, and CDC replication or stamping |

`admin_role` owns tables; migrations grant `runtime_role` what the application needs. An application
system administrator is not `admin_role`; their requests use the runtime connection and normal
request scope. Never use the admin connection in a request handler; it removes the RLS backstop.

## Failure modes

| Symptom | Likely boundary |
| --- | --- |
| A protected product query unexpectedly returns `[]` | The code used `baseDb`, omitted a tenant helper, or selected the wrong tenant |
| A request cannot enter a tenant or channel | Guard or membership validation failed before the operation |
| The request enters the channel but cannot perform an action | The permission engine denied it |
| A row combines a tenant with another tenant's root channel | The composite foreign key rejects it |
| A mutation changes `tenant_id` or the root channel | The immutability trigger rejects it |
| A contextless insert succeeds through `runtime_role` | Expected from write-through RLS; audit the missing application path |
| An RLS-bypass security test leaks data | Application authorization or query scope is relying on RLS |
| A maintenance query sees no protected rows | It is likely using `runtime_role` without tenant context |

## Adding tables

Full recipe: [New entity guide](./ADD_ENTITY.md). At the security boundary, verify:

1. Give the table `tenant_id` and its channel IDs through the shared entity-column helpers.
2. Place the correct authentication, tenant, and channel guards on every route.
3. Apply the shared permission engine to detail, collection, create, update, delete, and bulk paths.
4. Scope application queries by trusted tenant and channel context independently of RLS.
5. Add `tenantSelectPolicy()` and `writeThroughPolicies()` to the Drizzle table definition.
6. Add composite foreign keys and module-owned constraints for every stored ancestor relationship.
7. Register the table in `backend/src/db/channel-tables.ts` or `product-tables.ts` so migrations
   include RLS, grants, publication, and shared immutability setup.
8. Use `tenantRead*()` for protected reads and `tenantContext*()` for mutation transactions.
9. Test authorization with RLS bypassed, then test the RLS read boundary directly through
   `runtime_role`.

Register a tenant-scoped support table explicitly and review its authorization, query scope,
grants, constraints, and lifecycle.

## Verification

| Location | Current responsibility |
| --- | --- |
| `backend/src/db/rls-helpers.ts` | Tenant SELECT and write-through policy builders |
| `backend/src/db/tenant-context.ts` | Scoped transactions and session variables |
| `backend/scripts/migrations/10-rls.migration.ts` | Table classification, ownership, forced RLS, and grants |
| `backend/scripts/migrations/99-verify.migration.ts` | Generated checks for triggers, forced RLS, and runtime SELECT grants |
| `backend/src/db/immutability-triggers.ts` | Protected identity columns and append-only rules |
| `backend/tests/integration/rls-security.test.ts` | Runtime-role read isolation, write-through behavior, and structural backstops |
| `backend/tests/integration/schema-verification.test.ts` | Catalog checks under the integration-test role setup |
| `backend/tests/security/cross-tenant.test.ts` | Normal API tenant-guard behavior |
| `backend/tests/security/cross-org.test.ts` | Normal API channel and permission behavior |

Both are required: RLS behavior tests prove the backstop works, RLS-bypass tests prove it is not
the primary boundary.
