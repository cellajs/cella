# Multi-tenancy

Cella protects tenant data through defense in depth. Request guards establish tenant and channel
context, the shared permission engine authorizes actions, PostgreSQL row-level security (RLS)
limits product reads, and database constraints prevent inconsistent identities.

The useful database promise is simple: a tenant-scoped product query with no tenant context sees
no rows, and a query scoped to tenant A cannot read tenant B. Cella keeps that rule deliberately
small. Roles, memberships, and product actions remain in the shared permission engine, where the
API and optional workers can make the same decision.

This separation matters because Cella's row-level security (RLS) is a **tenant read boundary**. It
is not role-based access control and it is not the layer that authorizes writes.

## The boundary in one request

An authenticated attachment operation crosses these boundaries:

```text
HTTP request ─▶ authGuard ─▶ tenantGuard ─▶ orgGuard ─▶ scoped operation
                  │              │              │
                  │              │              └─ channel context
                  │              └─ tenant context
                  └─ actor

scoped operation ─┬─ tenantRead() ─▶ tenant-visible row(s)
                  ├─ shared permission engine ─▶ action decision
                  └─ tenantContext() ─▶ constrained write
```

The layers answer different questions:

| Layer | Question |
|---|---|
| Guards | Is this request authenticated and entering a valid tenant/channel context? |
| Permission engine | May this actor perform this action on this subject? |
| RLS | May this transaction see rows from this tenant? |
| Foreign keys and triggers | Can this stored row claim inconsistent or changing identity? |

The exact order depends on the operation. A detail read first loads a tenant-visible row and then
checks its row-dependent permission. A collection compiles readable scope into the query. A write
checks permission before changing the row. Read [Permissions](./PERMISSIONS.md) for contextual
roles, ownership, public reads, and action decisions. This guide covers the database boundary.

## What RLS covers

Cella applies `FORCE ROW LEVEL SECURITY` to tenant-scoped product tables and selected support
tables. The template's default protected tables are `attachments` and `yjs_documents`.

| Table category | RLS behavior | Authorization owner |
|---|---|---|
| RLS-classified product entities | Tenant-scoped SELECT; permissive write-through policies | Guards and permission engine |
| Tenant-scoped support tables | Same when explicitly registered; `yjs_documents` is the default | Owning module and guards |
| Channel entities | No RLS | Channel/organization guards and permissions |
| Memberships | No RLS | Membership operations and permissions |
| Ordinary resources | No RLS unless deliberately added | Owning route/module |

The migration classifier starts with registered entity tables, removes `user`, configured channel
types, and explicit exclusions such as `pages`, then adds the configured support tables. A normal
project-added product therefore joins the protected set after registration. `yjs_documents` is the
template's default protected support table.

Organization and membership queries using `baseDb` are therefore expected. Protected product
queries must enter a tenant helper; a direct runtime query has no session tenant and silently
returns an empty result rather than throwing.

## Tenant context and reads

The helpers in `backend/src/db/tenant-context.ts` open a transaction and set transaction-local
PostgreSQL variables before running feature queries:

| Variable | Current effect |
|---|---|
| `app.tenant_id` | Required tenant match for protected SELECTs; missing or empty fails closed |
| `app.include_deleted` | Allows soft-deleted rows to appear in explicit tombstone/delta reads |
| `app.user_id` | Available in the transaction, but current RLS policies do not consult it |

The read policy checks that the context exists, matches the row's `tenant_id`, and, for
soft-deletable tables, that the row is live unless deleted rows were requested. A wrong tenant and
a missing tenant both produce zero visible rows.

RLS does not enforce the organization or deeper channel boundary. The guard and permission path
validates that context before the query runs. This keeps the database predicate small and avoids a
membership subquery on every protected row.

## The read/write split

`FORCE ROW LEVEL SECURITY` requires policies for every operation the runtime role performs. Cella
uses a tenant-filtering SELECT policy and explicit, unconditional INSERT, UPDATE, and DELETE policy
expressions.

> **RLS does not authorize product writes.** The write-policy expressions contain no tenant or
> permission check, so a contextless insert can pass. Updates, deletes, validation reads, and
> `RETURNING` can still see no target rows when the SELECT policy lacks tenant context. Neither
> outcome is a substitute for application authorization.

The tenant context lets one mutation transaction see its validation rows, write the target, and
return the authoritative result without duplicating the permission engine in SQL. The permissive
write expressions keep that shared decision usable by the API and Yjs relay instead of creating a
second policy language in PostgreSQL.

### Transaction helpers

| Helper | Transaction | Use it for |
|---|---|---|
| `tenantRead(ctx, fn)` | Read only, live rows | Normal tenant-scoped product reads |
| `tenantReadIncludingDeleted(ctx, fn)` | Read only, includes tombstones | Delta and recovery reads that must observe deletes |
| `tenantContext(ctx, fn)` | Read/write, live rows | Creates and ordinary updates |
| `tenantContextIncludingDeleted(ctx, fn)` | Read/write, includes tombstones | Soft-delete and restore flows |

Each helper passes a cloned request context whose `db` is the transaction. Keep database work
inside the callback and use that scoped context in query functions. Formatting the response can
happen after the transaction returns.

## Structural backstops

Write authorization lives in the application, but the schema still prevents several classes of
invalid state:

- Tenant-scoped product rows carry `tenant_id`.
- Rows under the root organization use a composite foreign key such as
  `(tenant_id, organization_id)`, so the two IDs cannot describe different roots.
- Product identity triggers make the tenant and root organization immutable after insert.
- Membership identity columns are similarly protected, and the activity log is append-only.

Project-specific deeper ancestor IDs are not automatically part of the shared immutability trigger.
Their foreign keys and any extra immutability rules remain the owning module's responsibility.

These checks preserve row identity; they do not decide whether the current actor may edit the row.
That remains a permission decision before the write.

## Database roles

Cella uses separate PostgreSQL identities for application traffic and privileged maintenance:

| Role | RLS | Purpose |
|---|---|---|
| `runtime_role` | Enforced | API requests and normal application queries |
| `admin_role` | `BYPASSRLS` in the supported production setup | Migrations, seeds, maintenance, and CDC replication/stamping |

Table ownership belongs to `admin_role`, while the migration grants the runtime role only the
operations the application needs. Scaleway provisions the production admin user with bypass and
replication privileges. Local setup requests the same attributes but can fall back when a provider
forbids them, so verification must confirm that CDC and maintenance use a sufficiently privileged
connection. Verification migrations also check ownership, grants, policies, and forced RLS.

An application **system administrator** is not the PostgreSQL `admin_role`. System-administrator
status can bypass ordinary permission decisions, but request queries still use the runtime
connection and the appropriate tenant scope. Do not use the admin connection to simplify a request
handler; it removes the database safety net for that entire query.

## Failure modes as a debugging guide

| Symptom | Likely boundary |
|---|---|
| A product query unexpectedly returns `[]` | The code used `baseDb`, omitted a tenant helper, or selected the wrong tenant |
| A request cannot enter a channel | Guard or membership context failed before RLS |
| An actor can enter the channel but cannot perform an action | Permission policy denied it |
| A row combines a tenant with another tenant's organization | Composite foreign key rejects it |
| A mutation changes `tenant_id` or the root organization | Immutability trigger rejects it |
| A contextless insert succeeds | Expected from the permissive insert expression; audit the missing guard/permission path immediately |
| A maintenance query sees no protected rows | It is probably using `runtime_role` instead of the admin connection |

The important surprise is that write-policy expressions are permissive while protected reads fail
closed. Contextless updates and deletes may still affect no rows because target visibility depends
on the SELECT policy.

## Adding a tenant-scoped product table

The [New entity guide](./ADD_ENTITY.md) contains the complete feature recipe. At the database
boundary, check each of these points:

1. Give the table `tenant_id` and the root channel ID using the shared product-column helpers.
2. Add a composite foreign key from the tenant/root pair to the root channel table.
3. Add `tenantSelectPolicy()` and `writeThroughPolicies()` in the Drizzle table definition.
4. Register the table in `backend/src/tables.ts`. Migration producers use that registry for RLS,
   grants, publication setup, and shared immutability triggers.
5. Put route reads inside `tenantRead*()` and writes inside `tenantContext*()`.
6. Keep the relevant guard chain and permission decision in front of every operation, especially
   writes and bulk paths.
7. Add module-owned constraints for deeper ancestors or exceptional relationships.
8. Generate and review the migration, then run the security and schema-verification tests.

If the table is tenant-scoped support data rather than a configured product, edit the RLS
classification (including `additionalRlsTables` where appropriate) and give it the same
policy/handler review.

## Verification and code map

| Location | What it proves or defines |
|---|---|
| `backend/src/db/rls-helpers.ts` | SELECT and write-through policy builders |
| `backend/src/db/tenant-context.ts` | Scoped transaction helpers and session variables |
| `backend/scripts/migrations/10-rls.migration.ts` | Table classification, ownership, `FORCE RLS`, and grants |
| `backend/src/db/immutability-triggers.ts` | Protected identity columns and append-only rules |
| `backend/tests/integration/rls-security.test.ts` | Read isolation, tombstones, helper behavior, and permissive writes |
| `backend/tests/integration/schema-verification.test.ts` | Installed policies, roles, grants, and forced enforcement |
| `backend/tests/security/cross-tenant.test.ts` | End-to-end tenant separation through HTTP |
| `backend/tests/security/cross-org.test.ts` | End-to-end organization/channel enforcement through HTTP |

Together these tests pin both sides of the contract: reads fail closed at the database, while
writes depend on application authorization and structural constraints.
