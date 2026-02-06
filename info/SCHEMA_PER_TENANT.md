# Schema-per-tenant multi-tenancy

This document describes the architectural plan for implementing PostgreSQL schema-based tenant isolation in Cella.

## Problem

Cella currently uses row-level filtering (`organizationId` column) for tenant isolation. All product entity data lives in the `public` schema, filtered at the application layer via `hasOrgAccess` middleware. This approach has limitations:

- **No database-level isolation** — A bug in application code could leak data across tenants
- **Defense-in-depth gap** — Security relies entirely on correct application-layer filtering
- **Enterprise requirements** — Some customers require stronger isolation guarantees for compliance
- **Noisy neighbor risk** — Large tenants can impact query performance for smaller tenants sharing indexes

## Goal

Implement PostgreSQL schema-per-tenant isolation where:

- Shared entities (users, sessions, memberships, organizations) remain in `public` schema
- Product entities (attachments, pages) move to per-tenant schemas (`org_<id>`)
- The sync engine (CDC, ActivityBus, SSE) continues to operate with minimal changes
- Migration management scales to hundreds of tenants without blocking application startup

## Requirements

1. **Tenant schema lifecycle** — Create schema on organization creation, drop on deletion
2. **Migration tracking** — Track migration version per-tenant with distributed locking
3. **Keep entity hierarchy** — Keep `organizationId` column on product entities for defense-in-depth
4. **Sync engine compatibility** — CDC Worker must handle multi-schema WAL messages
5. **Cross-org queries** — Users with multiple org memberships can search across their tenants
6. **PGlite support** — Schema-per-tenant must work in `DEV_MODE=basic` (confirmed supported)

## Constraints

- **Drizzle limitations** — No native dynamic schema support; must use `SET search_path` pattern
- **Connection pooling** — Schema switching is session-scoped; queries must reset `search_path`
- **Single replication slot** — CDC Worker uses one slot for all tenants (no per-tenant slots)
- **Existing data migration** — Must migrate existing product entity data to tenant schemas
- **Activities table** — Remains in `public` schema, scoped by `organizationId` column

## Architectural solution

### Schema changes to organizationsTable

Extend `organizationsTable` with tenant schema management columns:

| Column | Type | Purpose |
|--------|------|---------|
| `schemaName` | varchar, unique | PostgreSQL schema name, e.g., `org_abc123` |
| `schemaStatus` | enum | `pending`, `creating`, `active`, `migrating`, `failed`, `archived` |
| `schemaMigrationVersion` | varchar, nullable | Last applied migration, e.g., `0003_tenant_init` |
| `schemaMigrationAppliedAt` | timestamp, nullable | When last migration completed |
| `schemaMigrationLockId` | varchar, nullable | Instance ID holding migration lock |
| `schemaMigrationLockExpiresAt` | timestamp, nullable | Lock expiry for dead-lock recovery |

Schema name uses organization ID (not slug) for immutability. Status enum enables state machine for lifecycle management.

### Drizzle configuration changes

Split table definitions and migrations into two paths:

| Path | Schema | Tables | Config |
|------|--------|--------|--------|
| `drizzle/` | `public` | users, organizations, memberships, sessions, tokens, activities | `drizzle.config.ts` |
| `drizzle-tenant/` | template | attachments, pages (product entities) | `drizzle-tenant.config.ts` |

Tenant table definitions in `src/db/schema/tenant/` use unqualified table names. At runtime, queries use a `withSchema(table, schemaName)` utility to dynamically qualify tables.

### Migration handling

#### Public schema migrations

No change from current behavior. Run at application startup via existing `migrate.ts`.

#### Tenant schema migrations

A background migration runner handles tenant schemas:

1. **Startup** — Application boots immediately; public schema migrated synchronously
2. **Background worker** — Separate process or async task handles tenant migrations
3. **Lock acquisition** — Worker claims tenants via `schemaMigrationLockId` with expiry timestamp
4. **Concurrency limit** — Process N tenants concurrently (configurable, default 3)
5. **Retry with backoff** — Failed migrations retry with exponential backoff
6. **Health endpoint** — Report migration progress for deployment orchestration

#### Migration lock protocol

1. Query tenants where `schemaStatus = 'active'` and `schemaMigrationVersion < currentVersion`
2. Attempt lock: `UPDATE organizations SET schemaMigrationLockId = :instanceId, schemaMigrationLockExpiresAt = NOW() + interval '5 minutes' WHERE id = :orgId AND (schemaMigrationLockId IS NULL OR schemaMigrationLockExpiresAt < NOW())`
3. If lock acquired (row updated), run migrations for that tenant
4. On completion: update `schemaMigrationVersion`, `schemaMigrationAppliedAt`, clear lock columns
5. On failure: set `schemaStatus = 'failed'`, clear lock, log error

#### Resource limits

- **Connection pool** — Tenant migrations use dedicated pool with limited connections
- **Concurrency** — Configurable max concurrent migrations per instance
- **Timeout** — Per-tenant migration timeout prevents runaway operations
- **Staggered start** — Random delay on worker startup prevents thundering herd

### CDC changes

#### Publication management

Single publication includes all tenant schemas:

- On org create: `ALTER PUBLICATION cella_cdc_pub ADD TABLES IN SCHEMA org_<id>`
- On org delete: `ALTER PUBLICATION cella_cdc_pub DROP TABLES IN SCHEMA org_<id>`

#### WAL message parsing

CDC Worker extracts schema from `message.relation.namespace`:

- Parse schema name from namespace field
- Extract organization ID from schema name pattern `org_<id>`
- Fall back to `organizationId` column if present in row data
- Table registry lookup remains by table name (same across schemas)

#### ActivityBus and SSE

No changes required. Both already route by `organizationId` from the activity payload, not by database schema.

### Query patterns

#### Single-tenant queries

Handler receives organization from context, resolves tenant tables:

1. Get `schemaName` from organization (already in context from `hasOrgAccess`)
2. Call `getTenantTables(schemaName)` to get schema-qualified table references
3. Execute query using tenant tables

#### Cross-tenant queries

For users with multiple memberships searching across orgs:

1. Fetch user's memberships with organization schema names
2. Execute parallel queries to each tenant schema
3. Merge results client-side or in application layer
4. Apply combined pagination/sorting after merge

### Data migration for existing installations

One-time migration script:

1. For each organization: create schema, apply tenant migrations
2. Copy product entity rows from `public` to `org_<id>` schema
3. Verify row counts match
4. Delete original rows from public schema
5. Update org `schemaStatus` to `active`

Run as idempotent script; safe to re-run on failure.

## Out of scope

- **Row-level security (RLS)** — Schema isolation provides stronger guarantees; RLS adds complexity without clear benefit
- **Per-tenant database** — Schema-per-tenant achieves isolation goals without connection pool explosion
- **Tenant-specific schema customization** — All tenants share identical table structures
- **Cross-tenant analytics** — Admin queries across all tenants require explicit UNION pattern
- **Schema-level resource quotas** — PostgreSQL does not support per-schema resource limits
- **Tenant data export** — Schema-based `pg_dump` possible but no automated tooling planned
- **Automated tenant archival** — Manual process via status enum; no scheduled cleanup
