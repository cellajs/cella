# Permissions

This document explains Cella's contextual RBAC: how the answer to **may this actor perform this action on this subject?** is computed, everywhere that question is asked.

### TL;DR

**You present an access, the policy is consulted, a permission is returned.** The permission
engine combines the user's memberships, the configured rules for their roles, and values on the
row. Roles are assigned on containers such as organizations, and content inside uses those roles.
Creator-only rules compare the user with the row's `createdBy` value.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Permission decision flow                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  Config, validated once at boot                                              │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ shared/config/                │  │ shared/config/                      │  │
│  │   hierarchy-config.ts         │  │   permissions-config.ts             │  │
│  │                               │  │                                     │  │
│  │ createEntityHierarchy(roles)  │  │ configurePermissions(types, cb)     │  │
│  │   .user()                     │  │   entity × channel × role → cell    │  │
│  │   .channel(name, {parent,     │  │   cell = 0 | 1 | 'own'              │  │
│  │     roles, elevated,          │  │   publicRead()                      │  │
│  │     rootRoles})               │  │                                     │  │
│  │   .product(name, {parent})    │  │                                     │  │
│  │                               │  │                                     │  │
│  │ kinds, ancestor chains, roles │  │ → policyMatrix, publicReadGrants    │  │
│  └──────────────┬────────────────┘  └────────────────┬────────────────────┘  │
│                 │                                    │                       │
│                 └────────────────┬───────────────────┘                       │
│                                  ▼                                           │
│      ┌──────────────────────────────────────────────────────────┐            │
│      │      Permission engine: shared/, tier-neutral, ORM-free  │            │
│      │                                                          │            │
│      │  getAllDecisions(policies, memberships, subject, opts)   │            │
│      │                                                          │            │
│      │  1. order channels   most-specific → root                │            │
│      │       channel entity → [self, ...ancestors]              │            │
│      │       product entity → [...ancestors]                    │            │
│      │  2. system admin?    allow every action, short-circuit   │            │
│      │  3. memberships      policy cell per (channelType, role) │            │
│      │       1           → grant            grantedBy membership│            │
│      │       condition   → grant iff matches(row, actor)        │            │
│      │                                      grantedBy relation  │            │
│      │       0           → nothing                              │            │
│      │  4. public read      widens `read` only                  │            │
│      │                                      grantedBy public    │            │
│      │  5. emit `can` + full grant attribution                  │            │
│      └───┬───────────┬────────────────┬────────────────┬────────┘            │
│          │           │                │                │                     │
│   ┌──────▼─────┐ ┌───▼──────────┐ ┌───▼───────────┐ ┌──▼─────────────┐       │
│   │ Backend    │ │ SSE dispatch │ │ Yjs relay     │ │ Frontend       │       │
│   │ routes     │ │              │ │               │ │                │       │
│   │ single row │ │ per event    │ │ WS upgrade,   │ │ computeCan →   │       │
│   │ + compiled │ │ row, class-  │ │ no backend    │ │ can-map, drives│       │
│   │ SQL for    │ │ collapsed    │ │ round-trip    │ │ UI affordances │       │
│   │ list reads │ │ fan-out      │ │               │ │ (never trusted)│       │
│   └────────────┘ └──────────────┘ └───────────────┘ └────────────────┘       │
│                                                                              │
│  Postgres RLS (app.tenant_id): separate layer, tenant isolation only.        │
│  Fail-closed on SELECT for tenant-scoped product tables. No role awareness.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine lives in `shared/`, ORM-free and tier-neutral: backend, frontend, and the standalone Yjs relay reach the same verdict from the same code. The engine **never loads rows**; callers hand in the row data a decision needs. The two config files are validated once at boot and change together: every role in every channel needs a policy row. Postgres RLS is a separate tenant-isolation layer with no role awareness; see [Multi-tenancy](./MULTI_TENANCY.md).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel** | Owns roles and memberships (`organization` in the template). Orders as `[self, ...ancestors]`. |
| **Product** | Owns no roles; inherits from channels (`attachment`). Orders as `[...ancestors]`. Must have a channel parent. |
| **User entity** | Carries no policies; `configurePermissions` filters it out. |
| **Membership** | Explicit `user → channel` relation; the engine reads only `{ channelType, channelId, role }` (`AccessMembership`). |
| **Subject** | What is acted on: entity type, optional id, `channelIds` scope, optionally `row`. |
| **Policy cell** | `PolicyCell`: `0` (deny), `1` (allow), or a row-condition name (`'own'`: allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete` (`appConfig.entityActions`). |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |

The TL;DR stages map to types: access (`Access`, `accessFrom(ctx)`), policy (`PolicyMatrix`, `PolicyCell`), permission (`PermissionResult`, `PermissionDecision`, the `can` map), grant (`GrantSource`, `grantedBy`).

## The access you present

Every `checkAccess*` call takes an explicit `Access`, actor plus memberships:

```ts
export type Access<T extends AccessMembership = AccessMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };
```

Backend handlers never assemble an access by hand: `accessFrom(ctx)` reads the guard-populated `userId`, `isSystemAdmin`, and `memberships` off the request context and yields `{ anonymous: true }` when nobody is signed in. The compiled-predicate paths (`compileRowConditionSql`, collection scopes, catchup reads) keep the membership-less `Actor` union and `actorFrom(ctx)`: memberships enter those paths as SQL scope.

## The policy consulted

**`shared/config/hierarchy-config.ts`**, a fluent builder:

```ts
export const roles = createRoleRegistry(["admin", "member"] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .channel("organization", { parent: null, roles: roles.all })
  .product("attachment", { parent: "organization" })
  .build();
```

**`shared/config/permissions-config.ts`** declares the matrix:

```ts
export const { policyMatrix, publicReadGrants } = configurePermissions(
  appConfig.entityTypes,
  ({ entityType, channels }) => {
    switch (entityType) {
      case "organization":
        channels.organization.admin({ read: 1, update: 1, delete: 1 });
        channels.organization.member({ read: 1, update: 0, delete: 0 });
        break;
      case "attachment":
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: "own", delete: "own" });
        break;
    }
  },
);
```

Omitted actions and missing role/channel rows deny, so policies only declare grants. `'own'` is the built-in owner condition; the engine reads the cell verbatim and only ever sees `0 | 1 | 'own'`. Public-read declarations are collected separately, being membership-independent.

Channel entities have two row kinds: **elevation** rows on an ancestor channel say what a parent's member may do to the child (where `create` lives); **self** rows on the same channel say what the entity's own members may do to it (no `create`). Product entities have only **home** rows, where `create` grants creating inside that channel.

## The permission returned

`getAllDecisions(policies, memberships, subject, options)` is the core; the **`checkAccess*` family** is what every tier calls, injecting the configured `publicReadGrants` and the hierarchy-compiled `elevatedGrants` (per-channel `elevated` declarations as `channelType:role` keys):

```ts
checkAccess(access, action, subject); // → PermissionResult: the request-path check
checkAccessBatch(access, action, subjects); // → BatchPermissionResult: one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject, options?); // → PermissionResult[]: many actors, one row (stream fan-out)
```

`checkAccessFanout` groups accesses into **access classes** (admin bit, one bit per row condition the subject's policies reference, roles held at the subject's channel levels) and walks the policy once per class, so cost scales with classes, not subscribers; `resolve-access.test.ts` property-tests that equal keys give equal decisions. `options.onInvalidMembership: 'deny'` fail-closes one corrupt access instead of the batch.

```ts
export type SubjectForPermission = {
  entityType: ChannelEntityType | ProductEntityType;
  id?: string;
  createdBy?: string | null;
  channelIds: AncestorChannelIds; // Partial<Record<ChannelEntityType, string | null>>
  row?: Record<string, unknown>; // for row conditions + public read
};

export interface PermissionDecision<
  T extends AccessMembership = AccessMembership,
> {
  subject: { entityType; id?; channelIds };
  actions: Record<
    EntityActionType,
    { allowed: boolean; grantedBy: GrantSource[] }
  >;
  can: Record<EntityActionType, boolean>;
  membership: T | null;
}
```

Ancestor scope is **tri-state**: `undefined` means a required scope was omitted and throws `MissingScopeError` (HTTP 400 `missing_scope`, WebSocket close `4400`); `null` means explicitly not scoped to that ancestor; a string is a concrete channel id. A missing scope never defaults to unscoped, which would bypass permissions.

Boundary code (DB rows, route params, CDC events) uses `buildSubject()` to turn column-shaped input (`{ organizationId: 'org_x' }`) into this shape; internals read `subject.channelIds.organization`, never a DB column name. `grantedBy` records why an action was allowed; `formatPermissionDecision`, `formatBatchPermissionSummary`, and the batch `decisions` map expose it.

## Row conditions

Two mechanisms widen access beyond the policy matrix, both reading the row's own columns. The set is **closed** to `own` and `public`: every rule must be evaluable in JS, compiled SQL, the frontend, and by dispatch from the row alone, so no cross-row or app-defined conditions.

A **row condition** (`shared/src/permissions/row-conditions.ts`) qualifies a grant per row: a cell of `1` grants on every row in channel scope, a condition cell only on matching rows. A condition is just its **name**:

```ts
export type RowConditionName = "own" | "public"; // this union IS the contract

export const matchesRowCondition = (
  name: RowConditionName,
  row,
  actor,
): boolean => {
  switch (name) {
    case "own":
      return !!actor.userId && !!row.createdBy && row.createdBy === actor.userId; // anonymous never matches
    case "public":
      return !!row.publicAt; // actor-independent
  }
};
```

Three exhaustive `switch`es map the name to behaviour: `matchesRowCondition` (JS, `shared/`), `compileRowConditionSql` (Drizzle, `backend/`), and the frontend `resolveCan` (`action-helpers.ts`). Adding a name is a compile error in each; the parity property test proves they agree.

**Public read** (`shared/src/permissions/public-read.ts`) makes rows with their own `publicAt` set readable by any actor, anonymous included, independent of memberships. Declared per subject with `publicRead()`, it widens `read` only. It is not a policy cell, but it resolves through the same `'public'` row condition and parity test.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | `authGuard` → `tenantGuard` → `orgGuard` | Authenticated, in-tenant, org member or system admin; never consults the policy matrix | 401 or 403 before the handler |
| Single row | `getValidProduct`, `getValidChannel` via `buildSubjectFromEntity` | Loads the row, passes it as `subject.row`, runs the engine | 403; 404 for a non-author on a draft |
| Create | `canCreateEntity` | No row exists yet; the subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | Splits allowed from denied | 403 only when nothing is allowed |
| Collection read | `resolveCollectionReadFilter` → `buildCollectionReadWhere` | Compiles readable scope, row conditions, and the public grant into one Drizzle `SQL` predicate; never materializes rows to reject them | `{ kind: 'none' }` returns `[]` without querying |
| Channel lists | `resolveChannelCollectionReadScope` → `buildChannelListReadWhere` (`channel-collection-scope.ts`) | Sub-org channel rows readable beyond own memberships, from org-root and ancestor grants (read+update sees drafts, read-only sees published); dormant in the template | Same tri-state |
| SSE dispatch | `rowReadDecisions` (`canReceiveProductEvent` is its batch-of-1) | One `checkAccessFanout` per event row over the channel's subscribers | Subscriber not notified; over-notifying leaks data because notified rows are fetchable by seq |
| Catchup views | `resolveViewReadStatus` | May the caller see the subtree's aggregate change signal (`e:f:`/counts)? `ok` needs a grant on the node or a verified ancestor; claimed prefixes must equal the counters row's canonical path ([Access](./SYNC_ENGINE.md#access)) | `opaque` or `forbidden` |
| Yjs relay | `canEditEntity` on WS upgrade | Reads the row and memberships over raw `pg` (`toTableName`/`toColumnName`), runs the same engine | WebSocket closed; `4400` for missing scope |

Two rules bind every path: **the system-admin bypass applies to collection reads too** (a sysadmin passes `orgGuard` with no membership, so scope resolution must not be membership-only), and **any grant the single-row path honours must appear in lists and over SSE**. The collection path returns a **tri-state** so "no restriction" is never confused with "no rows":

```ts
export type CollectionReadWhere =
  | { kind: "all" } // org-wide read: no scope restriction
  | { kind: "none" } // no readable scope: return [] without querying
  | { kind: "where"; where: SQL };
```

A bare `undefined` WHERE would leak the table; likewise the compiled SQL for a row condition emits `false` for an anonymous actor. Apps with sub-org channels compile the channel-list scope into a LEFT-joined membership list so discovery rows match single-row `checkAccess` results; the header comment of `channel-collection-scope.ts` is the consumer contract.

### Drafts and visibility

Two independent row axes sit beside the engine, which has no draft vocabulary; every check is introspection-guarded so tables without the column are untouched.

- **Draft** (`publishedAt`, opt-in product column, `shared/src/published-rows.ts`): unpublished rows are visible to their author alone, checked before the engine on every row path; publish is one-way. The primary boundary is the publication row filter that keeps drafts out of replication ([Drafts](./SYNC_ENGINE.md#drafts)); the SSE dispatch veto is fail-closed defense for a misconfigured app. The table still holds drafts, so collection and delta reads exclude them by predicate, the detail read 404s non-authors, the detail cache refuses them, and the Yjs relay rejects non-author write connections. Channel `publishedAt` (`defaultNow`) gates setup and invites, not reads.
- **Visibility** (`publicAt`): row-local and client-driven. A row is publicly readable only when its own `publicAt` is set; the server never derives it. The client sends `publicAt` on create (omitted means private; the template client defaults to the cached parent's value); afterwards the row owns its value, no cascade. Make private acts per row, channel, or batch.

Anonymous read requires the row's own `publicAt`, plus `publishedAt` where the column exists.

## Behavior

| Scenario | Outcome |
| --- | --- |
| Org admin acts on a product in their org | Allowed, `grantedBy: membership` |
| Member with `update: 'own'` edits a row they created | Allowed, `grantedBy: relation` (`own`) |
| Member with `update: 'own'` edits someone else's row | Denied; the UI enables the control optimistically, the backend rejects on save |
| Actor reads a row whose `publicAt` is set (entity declares `publicRead()`) | Allowed, `grantedBy: public`, single-row, in lists, and over SSE, anonymous included |
| System admin acts on any single row | Allowed, `grantedBy: systemAdmin`, before membership lookup |
| Actor loses access mid-Yjs-session | Materialization re-checks `update` on the backend before persisting |
| System admin joins a Yjs collab session | No bypass; authorized as the acting user, matching materialization |
