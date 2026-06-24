# Yjs local authorization via a shared permission engine

## Goal

Let the `yjs` relay worker make per-entity authorization decisions **locally**, removing the
synchronous `GET /yjs/verify-entity` backend round-trip on the WebSocket upgrade path — **without
duplicating any permission logic**.

The decision logic (the divergence-prone part) moves into `shared/`. Data access (resolving the
entity row, loading memberships) stays per-tier, which is unavoidable and low-risk.

### Why

- **Latency**: today every doc connection makes an HTTP callback to the backend
  (`yjs/src/server/auth.ts` → `verifyEntityAccess`) before any write is allowed
  (`yjs/src/server/upgrade.ts` → `verifyEntityAsync`).
- **Token churn**: a per-document capability token would avoid the callback but forces a token mint
  every time a user opens another editor on the same page. We want to keep the **coarse,
  connection-scoped token** (org/tenant gate, minted once) and resolve the fine-grained `'own'`
  decision in the relay.
- **No duplication**: the `'own'`/ancestor-chain logic must have exactly one home.

## Current state (verified)

### What the decision needs

`backend/src/modules/yjs/operations/verify-entity.ts` does three things:

1. **Resolve the entity** — `resolveEntity()` loads the row (existence, tenant, ancestor context id
   columns, `createdBy`). This is *data access*.
2. **Load memberships** — `SELECT * FROM memberships WHERE user_id = ?`. Data access.
3. **Run the engine** — `buildSubject()` → `checkPermission()`/`getAllDecisions()`. *Pure logic.*

Only step 3 is logic worth sharing. Steps 1–2 are per-tier SQL.

### What is already in `shared/src/permissions/`

Pure, no DB coupling — the policy model itself:
`access-policies.ts`, `compute-can.ts`, `action-helpers.ts`, `types.ts`, plus the `accessPolicies`
config (`shared/config/permissions-config.ts`), `hierarchy`, `appConfig`, entity guards.

### What is in `backend/src/permissions/` but effectively pure

These hold the engine and are movable. Their only backend couplings (verified) are listed:

| File | Backend couplings | Notes |
|---|---|---|
| `permission-manager/check.ts` (`getAllDecisions`) | `#/env` (`DEBUG` — one `console.warn`), `MembershipBaseModel` (type only) | Otherwise all `shared` imports |
| `permission-manager/types.ts` | `MembershipBaseModel` (type only) | — |
| `permission-manager/validation.ts` | `MembershipBaseModel` (type only) | — |
| `permission-manager/format.ts` | `MembershipBaseModel` (type only) | Debug/audit formatting |
| `build-subject.ts` | `#/permissions/permission-manager/types`, `#/permissions/validate-ancestor-scope` | + `shared/entity-id` (already shared) |
| `validate-ancestor-scope.ts` | `AppError` from `#/core/error` | The one real wrinkle — see below |

### What stays in `backend/src/permissions/` (DB-bound, do NOT move)

`check-permission.ts` (becomes a thin re-export/wrapper), `can-create.ts`, `collection-scope.ts`,
`get-context-entity.ts`, `get-product-entity.ts`, `split-by-permission.ts`. These import `baseDb`,
`resolveEntity`, `tenantRead`, `AppError`.

### Couplings to break (only three, all trivial)

1. **`MembershipBaseModel` type** — used purely as the generic constraint
   `<T extends MembershipBaseModel>`. The engine only reads `contextType`, `contextId`, `role`.
   Replace with a minimal **structural** interface in `shared`:

   ```ts
   // shared/src/permissions/permission-manager/types.ts
   export interface PermissionMembership {
     contextType: ContextEntityType;
     contextId: string;
     role: EntityRole;
     // forks/back-end models extend this freely; engine ignores extra fields
   }
   ```

   `MembershipBaseModel` already satisfies this shape (`memberships-db.ts`: `context_type`,
   `context_id` uuid, `role`), so backend keeps passing its own model with zero change.

2. **`#/env.DEBUG` in `check.ts`** — a single debug `console.warn`. Either drop it or pass an
   optional `debug?: boolean` through `PermissionCheckOptions`.

3. **`AppError` in `validate-ancestor-scope.ts`** — `AppError(400, 'missing_scope', ...)` is
   backend-only. In `shared`, throw a plain typed error (e.g. `class MissingScopeError extends Error`
   carrying `entityType`, `missingContext`, `missingKey`). The backend wrapper (`checkPermission`/
   handlers) catches it and re-throws `AppError` so HTTP behavior is unchanged. yjs maps it to WS
   close `4400`/`4003`.

### Verified facts about yjs

- `yjs` already depends on `shared` (`workspace:*`) and `pg` (raw client, **no drizzle**).
- `yjs/src/data/db.ts` exposes `withClient(tenantId, userId, fn)` — an RLS-scoped pooled client.
- `DocContext` (`yjs/src/constants.ts`) already carries `entityType`, `entityId`, `tenantId`,
  `userId`, `organizationId`. **The org-level ancestor id is already in hand** from the token.

### Entity-table mapping — solved by the CDC precedent

The CDC worker has the identical problem (standalone worker, no drizzle schema of its own) and solves
it by reaching into backend source rather than maintaining its own map:

- `cdc/tsconfig.json`: `"#/*": ["../backend/src/*"]`
- `cdc/package.json`: depends on `drizzle-orm`
- `cdc/src/table-registry.ts`: imports `entityTables` from `#/tables`, then `getTableName(table)` +
  `getColumns(table)` to build a name-keyed registry with a snake↔camel `columnNameMap`.

`backend/src/tables.ts` already exports the single source of truth: `entityTables`,
`getEntityTable(entityType)`, `getTableName`, `entityTableNames`. Forks edit this file when adding
entities. yjs adopts the same pattern (see Phase 2) — purely a compile-time/type + table-name
dependency, **no runtime backend call**.

## Target architecture

```
Connection (once per page/socket)
  client --GET /yjs/token--> backend            # coarse org/tenant gate, unchanged
  client --WS connect (token)--> yjs            # HMAC verify only, unchanged

Per editor opened on the page (the hot path)
  yjs:
    1. resolve entity row locally (created_by + ancestor ids)   # raw SQL via withClient
    2. memberships for user (cached per connection)             # raw SQL, cached
    3. buildSubject() + checkPermission()  -- SHARED ENGINE     # in-memory, no I/O
  => no backend callback, no per-doc token
```

RLS on `yjs_documents` (and the entity tables) remains the **defense-in-depth** backstop: even a
stale/forged token cannot read/write rows the connection's RLS context disallows.

## Implementation plan

### Phase 1 — Extract the engine into `shared` (no behavior change)

1. Create `shared/src/permissions/permission-manager/` and move:
   `check.ts`, `types.ts`, `validation.ts`, `format.ts`.
2. Move `build-subject.ts` and `validate-ancestor-scope.ts` into `shared/src/permissions/`.
3. Apply the three decoupling edits:
   - Add `PermissionMembership` interface; change generic bounds from `MembershipBaseModel` to
     `PermissionMembership`.
   - Remove/parameterize the `#/env.DEBUG` warn.
   - Replace `AppError` with a shared `MissingScopeError`.
4. Export the engine from `shared/src/permissions/index.ts` and re-export from `shared/index.ts`
   (mirror the existing permissions export block at `shared/index.ts:79-93`):
   `getAllDecisions`, `buildSubject`, `buildSubjectFromEntity`, `validateAncestorScope`,
   `MissingScopeError`, and the relevant types (`SubjectForPermission`, `PermissionDecision`,
   `PermissionCheckOptions`, `ContextEntityIdColumns`, `PermissionMembership`).
5. In `backend/src/permissions/`, replace the moved files with re-export shims so
   `#/permissions` keeps its current surface. Update `check-permission.ts` to import
   `getAllDecisions` from `shared` and to translate `MissingScopeError` → `AppError`.
6. Move/duplicate the unit tests (`build-subject.test.ts`, `permission-manager/index.test.ts`,
   `check.perf.test.ts`) alongside the shared engine; keep a thin backend test asserting the
   `AppError` translation still happens.

**Acceptance:** `pnpm check` and `pnpm test` green; backend behavior byte-for-byte unchanged
(callers in `dispatch-to-stream.ts`, `get-context-entity.ts`, `split-by-permission.ts`,
`can-create.ts` untouched).

### Phase 2 — Local entity + membership resolution in yjs

First, wire up the table-name source by mirroring CDC:

- Add `"#/*": ["../backend/src/*"]` to `yjs/tsconfig.json` and `drizzle-orm` to `yjs/package.json`
  (yjs currently has neither).
- yjs uses raw `pg`, so it needs only the **table name** and **snake_case column names** — not full
  drizzle querying:
  ```ts
  const table = getEntityTable(ctx.entityType);   // from #/tables
  const tableName = getTableName(table);           // e.g. "attachments"
  const cols = getColumns(table);                  // cols.createdBy.name === "created_by"
  ```
  Use `getColumns(table)[key].name` (or a `camelToSnake` helper as CDC does) for fork-safe DB column
  names.

Add `yjs/src/data/permissions.ts` (raw SQL, uses `withClient`):

- `loadMemberships(tenantId, userId)` →
  `SELECT context_type AS "contextType", context_id AS "contextId", role FROM memberships WHERE user_id = $1`.
  Returns `PermissionMembership[]`.
- `resolveEntityScope(ctx)` → fetch `created_by` and any **ancestor** context id columns for the
  entity, using `tableName`/`cols` above. For base cella (`attachment → organization`) the only
  ancestor is `organization`, and `ctx.organizationId` is **already** on `DocContext` — so the minimal
  query is just `SELECT created_by FROM <tableName> WHERE id = $1`. For deeper fork hierarchies, also
  select the ancestor id columns derived generically from
  `hierarchy.getOrderedAncestors(entityType).map(a => appConfig.entityIdColumnKeys[a])`
  (camelCase key → resolve to DB name via `cols`).

Then a `canEditEntity(ctx)` helper:

```ts
const subject = buildSubject(ctx.entityType, ancestorIds, { id: ctx.entityId, createdBy });
const { isAllowed } = checkPermission(memberships, 'update', subject, { userId: ctx.userId });
return isAllowed;
```

(`checkPermission` here is a tiny yjs-local wrapper over the shared `getAllDecisions`, or we export a
ready-made `checkPermission` from `shared` too — preferred, so both tiers call the identical entry.)

### Phase 3 — Swap the callback for local checks in yjs

- In `yjs/src/server/upgrade.ts`, replace `verifyEntityAccess(...)` (HTTP) with `canEditEntity(ctx)`.
- Keep the existing optimistic-buffer machinery (`pendingBuffers`, `flushPendingBuffer`,
  `discardPendingBuffer`) — only the *source* of the allow/deny boolean changes.
- **Cache memberships per WebSocket connection** (and optionally per `(tenantId,userId)` across docs
  on the same socket) so hopping editors costs one cheap `created_by` read + an in-memory check.
- Map `MissingScopeError`/denied → existing close codes (`4400`/`4003`); DB error → `4503`.
- Delete `verifyEntityAccess` from `yjs/src/server/auth.ts` (keep `verifyToken`).

### Phase 4 — Backend cleanup (optional, after yjs cutover is proven)

- The `GET /yjs/verify-entity` route/op can be retired **or** kept as a fallback behind config.
  Recommendation: keep it for one release as a feature-flagged fallback, then remove
  (`yjs-routes.ts`, `yjs-handlers.ts`, `operations/verify-entity.ts`).

## Caching & invalidation

- Memberships change rarely within a session. Cache per connection; accept staleness bounded by the
  connection lifetime (reconnect re-reads). This matches the existing token TTL tolerance.
- `created_by` is immutable in practice; safe to cache per `CollabSession` (keyed by entityId).
- RLS remains the backstop, so a stale cache cannot grant access to rows the DB would deny.

## Security review

- **No new trust surface**: yjs already holds DB credentials and an RLS-scoped pool; it already
  decrypts/validates the HMAC token. Moving the *decision* to yjs does not widen its privileges.
- **Defense-in-depth preserved**: entity-table + `yjs_documents` RLS still gate the data plane.
- **Tenant check**: keep the explicit `tenantId` match (token vs. requested) in `upgrade.ts` and the
  `entity.tenantId === tenantId` defense-in-depth check from `verify-entity.ts` inside
  `resolveEntityScope`.
- **`'own'` correctness**: identical engine + `createdBy` from the row → same result as today.

## Open questions / to verify before coding

1. **Entity-type → table-name mapping outside drizzle.** ✅ **Resolved** — adopt the CDC pattern:
   alias `#/* → ../backend/src/*` in `yjs/tsconfig.json`, add `drizzle-orm`, and import
   `getEntityTable`/`getTableName`/`getColumns` from `#/tables`. No new `appConfig` registry and no
   hand-maintained map. Trade-off: a compile-time coupling of yjs to `backend/src` (CDC already
   accepts this; it is type + table-name only, no runtime call). The denormalize-into-`yjs_documents`
   alternative remains available if a fork wants zero backend-source coupling.
2. **Deep hierarchies in forks.** Confirm the generic ancestor-column derivation
   (`entityIdColumnKeys` → snake_case) covers multi-level product entities, or rely on option (c).
3. **`checkPermission` export from `shared`.** Decide whether to lift the thin `checkPermission`
   wrapper (currently `backend/src/permissions/check-permission.ts`) into `shared` so both tiers call
   the exact same entry point, with backend adding only the `AppError` translation layer.

## Rollout

1. Phase 1 behind no flag (pure refactor, fully covered by existing tests).
2. Phases 2–3 behind a yjs config flag (`appConfig.services.yjs.localAuthz`) defaulting off; enable
   in dev → staging → prod, with the `/yjs/verify-entity` fallback still present.
3. Phase 4 removes the fallback once metrics show the local path is healthy (watch close-code rates
   `4003`/`4400`/`4503` and connection-accept latency).

## Test plan

Guiding principle: the engine refactor must be **behavior-preserving**, and the yjs local check must
return the **same decision** the `verify-entity` callback returns today. Tests are organized to prove
those two invariants, then cover the new yjs-only surface. Follows existing conventions
(`*.test.ts` adjacent to source; vitest `core`/`full` modes per `info/TESTING.md`; yjs tests live in
`yjs/src/tests/`).

### Phase 1 — engine extraction (no behavior change)

- **Relocated unit tests pass unchanged.** Move `build-subject.test.ts`,
  `permission-manager/index.test.ts`, and `check.perf.test.ts` into `shared` and run them there with
  zero assertion edits. This alone proves the move preserved logic.
- **`AppError` translation guard (backend).** Keep one backend test asserting that an
  un-scoped subject still surfaces as `AppError(400, 'missing_scope')` via the `checkPermission`
  wrapper (the shared engine now throws `MissingScopeError`; the wrapper must translate it).
- **`PermissionMembership` structural compatibility.** A type-level test (or a trivial runtime
  assertion) that `MembershipBaseModel` satisfies `PermissionMembership`, so backend callers keep
  passing their own model.
- **No-DEBUG regression.** Assert the engine no longer references `#/env` (import-graph check or a
  simple grep test) so the shared package stays backend-free.
- **Existing backend callers untouched.** Re-run the suites covering `dispatch-to-stream`,
  `get-context-entity`, `split-by-permission`, `can-create` — all must stay green with no edits.

### Parity / golden test (the keystone)

- **Old vs. new equivalence.** A table-driven test feeding a matrix of subjects × memberships through
  **both** `verifyEntityOp` (backend, current) and the new shared `checkPermission` path, asserting
  identical `allowed` for every case. Matrix must include:
  - context entity vs. product entity;
  - `'own'` granted (member with `createdBy === userId`) and denied (`createdBy !== userId`);
  - no membership at all → denied;
  - wrong tenant → denied (defense-in-depth);
  - ancestor-chain grant (org member editing org-scoped product) and miss (project-scoped).
- Seed via existing helpers (`createTestOrganization`, `createOrganizationAdminUser`,
  `createPasswordUser` from `backend/tests/helpers.ts`). Run in `core` mode (needs PostgreSQL).

### Phase 2 — yjs resolution unit tests (`yjs/src/tests/permissions.test.ts`)

- `loadMemberships` returns rows shaped as `PermissionMembership` (mock `pg` client / `withClient`).
- `resolveEntityScope`:
  - minimal path: org-only ancestor uses `ctx.organizationId`, queries only `created_by`;
  - generic path: a (fixture) deeper hierarchy selects ancestor id columns via `getColumns` name map;
  - missing entity row → denied / `MissingScopeError` surfaced.
- `canEditEntity` end-to-end over a mocked DB: allow/deny across the same matrix as the parity test.
- Table-name resolution: `getTableName(getEntityTable(type))` yields the expected table; column-name
  mapping resolves `createdBy → created_by` (mirror CDC's `table-registry` assumption).

### Phase 3 — yjs upgrade/handler tests (extend `yjs/src/tests/ws-server.test.ts`)

- Replace the existing `verify-entity` fetch mock expectations with local-check outcomes:
  - allowed → connection stays open, buffered messages flush (existing test 1.3.3 analog);
  - denied → close `4003`, buffer discarded (1.3.1 analog);
  - DB/resolver error → close `4503` (1.3.2 analog);
  - missing scope/bad params → close `4400`.
- **Membership cache.** Assert memberships are loaded once per connection and reused when the user
  opens additional editors (spy on `loadMemberships`; expect a single call across N docs).
- **Feature-flag both paths.** With `localAuthz` off, the HTTP callback path still works (keep a
  guarded copy of the current tests); with it on, the local path is exercised. This protects the
  rollout fallback.

### Phase 4 — cleanup

- Once the flag is permanently on, delete the callback-path tests and the `verify-entity`
  route/op test together with the code.

### Security-focused cases (must-have)

- Forged/stale token cannot bypass: even with a syntactically valid token, RLS context (`app.user_id`)
  prevents reading a row the user can't access — assert `resolveEntityScope` returns no row under a
  mismatched RLS context.
- Tenant isolation: token tenant ≠ requested tenant → `4003` (already in `upgrade.ts`, keep covered).
- `'own'` cannot be spoofed: `createdBy` comes from the DB row, never the client/token.

### Exit criteria

- Parity test: 100% agreement old vs. new across the matrix.
- `pnpm test` (full) green, including the new yjs suites.
- Coverage on `shared/src/permissions/**` and `yjs/src/data/permissions.ts` ≥ existing engine
  coverage (no net regression in `coverage/coverage-summary.json`).
