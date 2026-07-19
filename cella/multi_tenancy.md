# Multi-tenancy

Application authorization is Cella's primary multi-tenancy boundary. Request guards, scoped
queries, and the shared permission engine must keep tenant data isolated even if row-level security
(RLS) is disabled or bypassed.

RLS is a second, deliberately narrow layer for tenant-scoped reads. If an application query omits
tenant scope or selects the wrong tenant, PostgreSQL prevents rows from another tenant from being
returned. RLS does not authorize writes or model roles, memberships, ownership, or product actions.

## Security contract

The two layers cover independent failures:

| Situation | Expected result |
| --- | --- |
| RLS is absent, application authorization is correct | Guards, permissions, and query scope still prevent unauthorized access |
| An application read has the wrong tenant scope, RLS is active | RLS hides rows from every other tenant |
| A permission bug exposes data within the active tenant | RLS cannot help because the row still matches the tenant |
| Application scope and RLS both fail | Cross-tenant isolation can fail |

RLS must not be load-bearing for an authorization decision. A user-facing API or worker path should
produce the same allow or deny result when connected through a test role that bypasses RLS. The
planned parity suite and related hardening are tracked in
[RLS defense-in-depth follow-up](../.todos/RLS_DEFENSE_IN_DEPTH.md).

## Responsibilities by layer

| Layer | Responsibility |
| --- | --- |
| Authentication and request guards | Establish the actor and validate tenant and channel entry |
| Shared permission engine | Decide whether the actor may perform an action on a subject |
| Scoped application queries | Limit candidates to the tenant, channel, and readable row scope |
| RLS | Reject cross-tenant product reads when application tenant scope is wrong or missing |
| Foreign keys, unique constraints, and triggers | Reject inconsistent identities, duplicates, and forbidden identity changes |

A detail operation loads a candidate row, validates its request scope, and checks the row-dependent
permission. A collection compiles readable scope into its SQL predicate. A write validates the
request context and permission before changing the row. Read [Permissions](./PERMISSIONS.md) for
contextual roles, ownership, public reads, and action decisions.

## What RLS covers

Cella applies `FORCE ROW LEVEL SECURITY` to tenant-scoped product tables and selected support
tables. The template's default protected tables are `attachments` and `yjs_documents`.

| Table category | RLS behavior | Primary authorization |
| --- | --- | --- |
| RLS-classified product entities | Tenant-scoped SELECT; permissive writes | Guards, scoped queries, and permissions |
| Registered tenant support tables | Same RLS shape; `yjs_documents` is the default | Owning module and guards |
| Channel entities | No RLS | Channel and organization guards plus permissions |
| Memberships | No RLS | Membership operations and permissions |
| Ordinary resources | No RLS unless deliberately registered | Owning route or module |

The migration classifier starts with registered entity tables, removes `user`, configured channel
types, and explicit exclusions such as `pages`, then adds configured support tables. A registered
product entity therefore joins the protected set automatically. RLS coverage does not replace the
route's authorization or query-scoping requirements.

Organization and membership queries using `baseDb` are expected because those tables have no RLS.
Protected product reads must enter a tenant helper. A direct runtime query has no tenant context and
normally returns no protected rows rather than throwing.

## Tenant reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction and set transaction-local
PostgreSQL variables before running feature queries:

| Variable | Current RLS effect |
| --- | --- |
| `app.tenant_id` | Required tenant match for protected SELECTs; missing or empty fails closed |
| `app.include_deleted` | Makes soft-deleted rows visible to explicit tombstone and delta reads |
| `app.user_id` | Available to the transaction; current RLS policies do not consult it |

The SELECT policy requires a non-empty tenant context and an exact match with the row's `tenant_id`.
For soft-deletable tables it also hides tombstones unless `app.include_deleted` is true. A wrong
tenant and a missing tenant both produce zero visible rows.

RLS does not enforce the organization or a deeper channel boundary. Guards, permission predicates,
and explicit query scope remain responsible for those boundaries. This keeps the database predicate
small and avoids a membership lookup for every protected row.

### Transaction helpers

| Helper | Transaction | Use it for |
| --- | --- | --- |
| `tenantRead(ctx, fn)` | Read only, live rows | Normal protected product reads |
| `tenantReadIncludingDeleted(ctx, fn)` | Read only, includes tombstones | Delta and recovery reads |
| `tenantContext(ctx, fn)` | Read/write, live rows | Creates and ordinary updates |
| `tenantContextIncludingDeleted(ctx, fn)` | Read/write, includes tombstones | Soft-delete and restore flows |

Each helper passes a cloned request context whose `db` is the transaction. Database work must stay
inside the callback and query functions must use the scoped context. Response formatting can happen
after the transaction returns.

## Write-through policies

When RLS is enabled and no applicable policy exists, PostgreSQL denies the operation. Cella installs
explicit INSERT, UPDATE, and DELETE policies whose expressions are `true`, so runtime writes can
proceed after application authorization.

This split keeps membership and product permissions in the shared engine used by the API and Yjs
relay. It also avoids evaluating membership subqueries for every affected row. The tenant transaction
still lets a mutation read its validation rows and return its result under the protected SELECT
policy, but the write policy itself supplies no authorization.

> **A contextless insert can pass the RLS policy.** Updates and deletes must also be treated as
> application-authorized operations. Their ordinary validation reads or `RETURNING` clauses can be
> hidden by the SELECT policy, but that behavior is not a write-security contract.

Write safety is composed from separate mechanisms:

| Concern | Mechanism | Limit |
| --- | --- | --- |
| Actor may perform the action | Guards and shared permission engine | Must be called by every mutation path |
| Initial tenant and root channel | Server derives identity from guarded context | A direct contextless SQL insert is outside this protection |
| Update or delete targets | Operation query uses guarded IDs and channel scope | RLS write policies do not add missing predicates |
| Tenant and root channel agree | Composite foreign key such as `(tenant_id, organization_id)` | Does not authorize the actor |
| Product identity cannot move | Immutability trigger protects tenant and root identity | Does not validate the initial insert |
| Duplicate identity is rejected | Primary keys and unique constraints | Uniqueness does not establish tenant ownership |

Tenant-scoped product rows carry `tenant_id`. Product rows under the root channel use a composite
foreign key, and shared product triggers make the tenant and root channel immutable after insert.
Membership identity columns are similarly protected, and the activity log is append-only.

Deeper ancestor IDs are not automatically part of the shared product immutability trigger. Support
tables such as `yjs_documents` also do not automatically receive product triggers. Their foreign
keys, query scope, update privileges, and extra constraints remain the owning module's responsibility.

## Database roles

Cella uses separate PostgreSQL identities for application traffic and privileged maintenance:

| Role | RLS | Purpose |
| --- | --- | --- |
| `runtime_role` | Enforced | API requests and enabled workers using the runtime connection |
| `admin_role` | `BYPASSRLS` in the supported production setup | Migrations, seeds, maintenance, and CDC replication or stamping |

Table ownership belongs to `admin_role`, while migrations grant `runtime_role` the operations the
application needs. An application system administrator is not the PostgreSQL `admin_role`.
System-administrator requests still use the runtime connection and normal request scope.

Do not use the admin connection in a request handler. It removes the RLS backstop for every query on
that connection. RLS is designed to catch application query mistakes, not arbitrary SQL executed
with a compromised database credential. The runtime role can choose session variables such as
`app.tenant_id`, and the admin role bypasses RLS entirely.

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

The [New entity guide](./ADD_ENTITY.md) contains the complete feature recipe. At the security
boundary, verify each of these points:

1. Give the table `tenant_id` and its channel IDs through the shared entity-column helpers.
2. Place the correct authentication, tenant, and channel guards on every route.
3. Apply the shared permission engine to detail, collection, create, update, delete, and bulk paths.
4. Scope application queries by trusted tenant and channel context independently of RLS.
5. Add `tenantSelectPolicy()` and `writeThroughPolicies()` to the Drizzle table definition.
6. Add composite foreign keys and module-owned constraints for every stored ancestor relationship.
7. Register the table in `backend/src/tables.ts` so migrations include RLS, grants, publication, and
   shared immutability setup.
8. Use `tenantRead*()` for protected reads and `tenantContext*()` for mutation transactions.
9. Test authorization with RLS bypassed, then test the RLS read boundary directly through
   `runtime_role`.

For a tenant-scoped support table, register it explicitly and review its application authorization,
query scope, grants, constraints, and lifecycle independently. Product-table assumptions do not
automatically apply to support tables.

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

RLS behavior tests and RLS-bypass authorization tests prove different properties. Both are required:
the first proves that the database backstop works, and the second proves that it is not the primary
authorization boundary.
