# RLS defense in depth: explicit scope, lazy admin credential, verified catalog

## What & why

Application authorization no longer leans on RLS. `requestScopeWhere(ctx, table)`
(`backend/src/db/utils/request-scope.ts`) adds the guarded tenant + organization predicate to every
organization-bound product query; `splitByPermission` rejects unknown and out-of-scope ids. The
admin pool is lazy: `migrationDb`, `unsafeInternalAdminDb` and `seedDb` are replaced by
`getAdminDb(purpose)` and `getSeedDb()`, and `DATABASE_ADMIN_URL` is optional for the API. The RLS
and verify migrations refuse to run without `runtime_role` and `admin_role`; the verifier asserts
owner, policies, grants and `BYPASSRLS`. The Yjs sweep runs per tenant and `deleteStaleDoc` takes
the row.

## Blast radius

Sync-breaking for apps that import `seedDb`, `migrationDb` or `unsafeInternalAdminDb`, and for
apps whose test setup migrates before creating the roles (the migration now aborts). The combined
side-effect migration re-emits (`pnpm generate`), so the next deploy re-applies every block and
verifies the catalog: a database migrated without roles fails that deploy instead of running
degraded. No wire change.

## Run

No script: manual.

## Manual steps

1. Replace `seedDb` with `getSeedDb()` (call it once per module: `const db = getSeedDb();`), `migrationDb` with `getAdminDb('migrations')` and `unsafeInternalAdminDb` with `getAdminDb('<purpose>')`; drop `if (!migrationDb)` guards, the getter throws.
2. App product queries (lists, counts, updates, soft-deletes, bulk predicates) add `requestScopeWhere(ctx, table)` next to their id predicate; `findAttachmentsByIds`-style helpers take `AuthContext`.
3. Any test that truncates, seeds RLS tables, inserts `system_roles` or calls `recalculateCounters` uses `getAdminDb('test setup')` / `getSeedDb()`, never the runtime connection.
4. Test global setup creates `runtime_role` and `admin_role` before `migrate()`; stop re-applying triggers, ownership or grants after it. Reset a test volume migrated without roles: `pnpm docker:test:reset`.
5. `pnpm generate` and commit the new `*_side_effects` folder.
6. Fork Yjs code calling `deleteStaleDoc(entityType, entityId)` passes the stale row (`{ entityType, entityId, tenantId }`).
7. Add `test:runtime` (backend) and `test:core:runtime` (root) scripts and the CI step from cella's `ci.yml` so the suite also runs as `runtime_role`.

## Verify

```sh
grep -rn "seedDb\|migrationDb\|unsafeInternalAdminDb" --include="*.ts" backend cdc yjs   # only getSeedDb/getAdminDb call sites
pnpm generate
pnpm check
pnpm test:core
pnpm test:core:runtime
```
