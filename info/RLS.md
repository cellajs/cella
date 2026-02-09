# Row-Level Security (RLS) Design

This document explains the architectural rationale for PostgreSQL Row-Level Security in Cella.

RLS is a **defense-in-depth** layer, not the primary authorization mechanism. Cella's membership-based permission manager remains the authorization layer. RLS adds database-level protection against application bugs and incorrect queries.

---

## Why RLS?

Even with correct application code:
- A single bug in a query could expose data across tenants
- Refactoring might accidentally remove a WHERE clause
- New developers might write queries that bypass the permission checks

RLS ensures that even if the application layer fails, the database won't return or accept data from the wrong tenant. The permission manager grants access; RLS acts as a safety net.

---

## Defense layers

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Permission Manager (primary authorization)          │    │
│  │  • Role checks, membership verification              │    │
│  │  • Project/workspace-level access control            │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↓ Bug here?                        │
├─────────────────────────────────────────────────────────────┤
│                      RLS LAYER (safety net)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Row-Level Security policies                         │    │
│  │  • Tenant boundary enforcement                       │    │
│  │  • Organization membership verification              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↓ Catches org/tenant leaks         │
├─────────────────────────────────────────────────────────────┤
│                    FK LAYER (integrity)                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Composite Foreign Keys                              │    │
│  │  • Prevents franken-rows at INSERT time              │    │
│  │  • Works even with admin bypass                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

Each layer catches different failure modes:

| Layer | Catches | Example Failure |
|-------|---------|-----------------|
| Permission Manager | Unauthorized actions | User tries to delete without permission |
| RLS | Cross-tenant/org data leaks | Query missing WHERE clause |
| Composite FKs | Data integrity corruption | Handler passes wrong org ID |

---

## The two-boundary model

RLS enforces exactly two hard boundaries at the database level:

```
┌──────────────────────────────────────────────────────────────────┐
│  TENANT A                           TENANT B                      │
│  ════════                           ════════                      │
│  ┌────────────────────────┐        ┌────────────────────────┐    │
│  │ Organization 1         │        │ Organization 3         │    │
│  │ ┌────────┐ ┌────────┐  │        │ ┌────────┐ ┌────────┐  │    │
│  │ │Project │ │Project │  │        │ │Project │ │Project │  │    │
│  │ │   A    │ │   B    │  │        │ │   E    │ │   F    │  │    │
│  │ └────────┘ └────────┘  │        │ └────────┘ └────────┘  │    │
│  └────────────────────────┘        └────────────────────────┘    │
│  ┌────────────────────────┐                                       │
│  │ Organization 2         │           ▲                           │
│  │ ┌────────┐ ┌────────┐  │           │                           │
│  │ │Project │ │Project │  │           │ RLS BLOCKS                │
│  │ │   C    │ │   D    │  │           │ (hard boundary)           │
│  │ └────────┘ └────────┘  │           │                           │
│  └────────────────────────┘           │                           │
│           ▲                           │                           │
│           │ RLS BLOCKS ───────────────┘                           │
│           │ (hard boundary)                                       │
│           │                                                       │
│  ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                 │
│           │                                                       │
│   Project A ←→ Project B                                          │
│           │                                                       │
│   App layer only (RLS does NOT catch this)                        │
└──────────────────────────────────────────────────────────────────┘
```

**What this means:**

| Leak Type | Caught By |
|-----------|-----------|
| Cross-tenant | ✓ RLS (hard boundary) |
| Cross-organization | ✓ RLS (hard boundary) |
| Cross-project (within org) | Application layer only |

This is intentional. RLS catches the most severe bugs (multi-tenant SaaS data leaks) while keeping policies simple and universal across all forks.

---

## Policy categories

| Category | SELECT | Write* | When to Use | Examples |
|----------|--------|--------|-------------|----------|
| **Standard** | tenant + org | tenant + org | Org-scoped data requiring membership | attachments |
| **Hybrid** | public OR tenant+org | tenant + org | Entities with `public_access` column | pages, tasks |
| **Cross-tenant read** | user_id | tenant | User sees own data across tenants | memberships |
| **Privilege-based** | role | role | System-only writes, append-only | activities |

*Write = INSERT/UPDATE/DELETE. Legend: tenant = tenant_id matches session; org = membership EXISTS; public = `public_access` column is true; user_id = user_id matches session; role = DB role grant.

### Hybrid public access

Entities with `publicAccess` configured in the hierarchy builder get **hybrid RLS policies**. The `public_access` column on each row determines visibility:

- **SELECT**: `public_access = true` OR (tenant + org membership)
- **INSERT/UPDATE/DELETE**: tenant + org membership only

This single mechanism handles both "always public" entities (set `public_access = true` on all rows) and "sometimes public" entities (set per-row based on project settings).

The hierarchy config declares which entities support public access:
```typescript
.product('page', { parent: null, publicAccess: { actions: ['read'] } })
.product('task', { parent: 'project', publicAccess: { inherits: 'project' } })
```

At migration time, `hierarchy.canBePublic()` determines which tables get hybrid vs standard policies.

---

## Security principles

### Fail-closed enforcement

All policies deny access when session context is missing. If middleware fails to set `app.tenant_id`, queries return zero rows rather than leaking data.

### Role-based admin bypass

Admin operations use a separate database connection with `BYPASSRLS`, not a session variable. This makes dangerous paths explicit and auditable.

### Operation-specific policies

Instead of `FOR ALL`, use separate policies for SELECT, INSERT, UPDATE, DELETE. This enables:
- Different rules for reads vs writes
- `WITH CHECK` clauses to prevent boundary violations on writes
- Clearer audit trail

### Immutable identity columns

Critical columns like `tenant_id`, `organization_id`, and `user_id` on memberships cannot be changed after creation. Database triggers reject UPDATE attempts that modify these values.

This prevents bugs or compromised code from "moving" records across boundaries — even if RLS allows the UPDATE, the trigger catches identity column changes.

---

## Composite foreign keys (franken-row prevention)

RLS policies prevent unauthorized access, but don't prevent **franken-rows** — records where `tenant_id=A` but `organization_id` points to an org in tenant B.

Composite FKs guarantee at the database level that referenced parents belong to the same tenant. This catches integrity bugs at insert time, even when using admin bypass paths.

**Key relationships requiring composite FKs:**

| Child | Parent | FK Columns |
|-------|--------|------------|
| memberships | organizations | (tenant_id, organization_id) |
| product entities | organizations | (tenant_id, organization_id) |
| attachments | pages | (tenant_id, page_id) |

---

## Role separation

| Role | Purpose | RLS Behavior |
|------|---------|--------------|
| Runtime | All app requests | Subject to RLS |
| CDC | Activity log writes | Append-only (no RLS, minimal privileges) |
| Admin | Migrations, seeds, system jobs | Bypasses RLS |

The runtime role never owns tables and cannot escalate privileges. This ensures `FORCE ROW LEVEL SECURITY` applies correctly.

---

## Fork contract

To guarantee RLS works correctly for any entity hierarchy:

> **Every tenant-scoped table must have `tenant_id`. Tables with an organization parent must also have `organization_id` with a composite FK to `organizations(tenant_id, id)`. Parentless product entities (like `page`) only require `tenant_id`.**

This rule makes the design compatible with any entity hierarchy — forks can add projects, workspaces, or other nested contexts without modifying RLS policies. The hierarchy config determines which pattern applies: entities with `parent: 'organization'` (or a nested context) get both columns, while entities with `parent: null` are tenant-scoped only.

### Table type reference

| Type | Required Columns | Composite FK | RLS | Example |
|------|------------------|--------------|-----|---------|
| Org-scoped (most tables) | tenant_id, organization_id | → organizations | Standard or hybrid | attachments |
| Tenant-only | tenant_id | None | Tenant-only or hybrid | pages |
| Global | None | None | None or user-based | users, sessions |

---

## Implementation reference

For detailed implementation including code examples, migration checklists, and policy definitions, see [RLS_IMPLEMENTATION.md](RLS_IMPLEMENTATION.md).
