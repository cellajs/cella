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
│  │   .organization({roles,       │  │   cell = 0 | 1 | 'own'              │  │
│  │     elevated})                │  │   publicRead()                      │  │
│  │   .channel(name, {parent,     │  │                                     │  │
│  │     roles, organizationRoles})│  │                                     │  │
│  │   .product(name, {parent})    │  │                                     │  │
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
│      │  1. order channels   most-specific → organization        │            │
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
│   │ SQL for    │ │ collapsed    │ │ round-trip    │ │ UI controls    │       │
│   │ list reads │ │ fan-out      │ │               │ │ (never trusted)│       │
│   └────────────┘ └──────────────┘ └───────────────┘ └────────────────┘       │
│                                                                              │
│  Postgres RLS (app.tenant_id): separate layer, tenant isolation only.        │
│  Fail-closed on SELECT for tenant-scoped product tables. No role awareness.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine **never loads rows**. Callers hand in the row data a decision needs. The two config files are validated once at boot and change together. A role or channel without a policy row denies. Postgres RLS: [Multi-tenancy](./MULTI_TENANCY.md).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel** | Owns roles and memberships. `organization` is the fixed spine every channel nests under. Orders as `[self, ...ancestors]`. |
| **Product** | Owns no roles and inherits from channels (`attachment`). Orders as `[...ancestors]`. Must have a channel parent. |
| **User entity** | Carries no policies. `configurePermissions` filters it out. |
| **Membership** | Explicit `user → channel` relation. The engine reads only `{ channelType, channelId, role }` (`AccessMembership`). |
| **Subject** | What is acted on: entity type, optional id, `channelIds` scope, optionally `row`. |
| **Policy cell** | `0` (deny), `1` (allow), or a row-condition name (`'own'` in policies: allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete` (`appConfig.entityActions`). |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |

## The access you present

Every `checkAccess*` call takes an explicit `Access`, actor plus memberships:

```ts
export type Access<T extends AccessMembership = AccessMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };
```

Backend handlers never assemble an access by hand: `accessFrom(ctx)` reads the guard-populated `userId`, `isSystemAdmin`, and `memberships` off the request context and yields `{ anonymous: true }` when nobody is signed in.

## The policy consulted

**`shared/config/hierarchy-config.ts`**, a fluent builder:

```ts
export const roles = createRoleRegistry(["admin", "member"] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .organization({ roles: roles.all, elevated: roles.all })
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

Omitted actions and missing role/channel rows deny, so policies only declare grants. `'own'` is the built-in owner condition. The engine reads the cell verbatim and only ever sees `0 | 1 | 'own'`. Public-read declarations are collected separately, being membership-independent.

Channel entities have two row kinds: **elevation** rows on an ancestor channel say what a parent's member may do to the child (where `create` lives). **Self** rows on the same channel say what the entity's own members may do to it (a self-row `create` is inert). Product entities have only **home** rows, where `create` grants creating inside that channel.

## The permission returned

`getAllDecisions(policies, memberships, subject, options)` is the core. The **`checkAccess*` family** is what every tier calls, injecting the configured `publicReadGrants` and the hierarchy-compiled `elevatedGrants` (per-channel `elevated` declarations as `channelType:role` keys):

```ts
checkAccess(access, action, subject); // → PermissionResult: the request-path check
checkAccessBatch(access, action, subjects); // → BatchPermissionResult: one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject, options?); // → PermissionResult[]: many actors, one row (stream fan-out)
```

```ts
export type SubjectForPermission = {
  entityType: ChannelEntityType | ProductEntityType;
  id?: string;
  createdBy?: string | null;
  channelIds: AncestorChannelIds; // Partial<Record<ChannelEntityType, string | null>>
  row?: Record<string, unknown>; // for row conditions + public read
};
```

Ancestor scope is **tri-state**. `undefined` means a required scope was omitted and throws `MissingScopeError` (HTTP 400 `missing_scope`, WebSocket close `4400`). `null` means explicitly not scoped to that ancestor. A string is a concrete channel id. A missing scope never defaults to unscoped, which would bypass permissions.

## Row conditions

Two mechanisms widen access beyond the policy matrix, both reading the row's own columns. The set is **closed** to `own` and `public`: every rule must be evaluable in JS, compiled SQL, the frontend, and by dispatch from the row alone, so no cross-row or app-defined conditions.

A **row condition** (`shared/src/permissions/row-conditions.ts`) qualifies a grant per row: a cell of `1` grants on every row in channel scope, a condition cell only on matching rows. A condition is just its **name**:

```ts
export type RowConditionName = "own" | "public"; // this union IS the contract
```

**Public read** (`shared/src/permissions/public-read.ts`) makes rows with their own `publicAt` set readable by any actor, anonymous included, independent of memberships. Declared per subject with `publicRead()`, it widens `read` only. It is not a policy cell, but it resolves through the same `'public'` row condition and parity test.

Two row columns sit beside the engine: drafts (`publishedAt`) are visible to their author alone and checked before the engine ([Drafts](./SYNC_ENGINE.md#drafts)). Visibility (`publicAt`) is row-local, set by the client on create, and never cascades.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | `authGuard` → `tenantGuard` → `orgGuard` | Authenticated, in-tenant (member or tenant creator), org member or system admin. Never consults the policy matrix. | 401, 403, or 404 before the handler |
| Single row | `getValidProduct`, `getValidChannel` via `buildSubjectFromEntity` | Loads the row, rejects it outside the request tenant or organization, passes it as `subject.row`, runs the engine | 403, or 404 for an out-of-scope row or a non-author on a draft |
| Create | `canCreateEntity` | No row exists yet. The subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | Splits allowed from denied | 403 only when nothing is allowed |
| Collection read | `resolveCollectionReadFilter` → `buildCollectionReadWhere` | Compiles readable scope, row conditions, and the public grant into one Drizzle `SQL` predicate. Never materializes rows to reject them. | `{ kind: 'none' }` returns `[]` without querying |
| SSE dispatch | `rowReadDecisions` (`canReceiveProductEvent` is its batch-of-1) | One `checkAccessFanout` per event row over the channel's subscribers | Subscriber not notified. Over-notifying leaks data because notified rows are fetchable by seq |
| Catchup views | `resolveViewReadStatus` | May the caller see the subtree's aggregate change signal (`e:f:`/counts)? `ok` needs a grant on the node or a verified ancestor. Claimed prefixes must equal the counters row's canonical path ([Access](./SYNC_ENGINE.md#access)) | `opaque` or `forbidden` |

Two rules bind every path: **the system-admin bypass applies to collection reads too** (a sysadmin passes `orgGuard` with no membership, so scope resolution must not be membership-only), and **any grant the single-row path honours must appear in lists and over SSE**. The collection path returns a **tri-state** so "no restriction" is never confused with "no rows":

```ts
export type CollectionReadWhere =
  | { kind: "all" } // org-wide read: no scope restriction
  | { kind: "none" } // no readable scope: return [] without querying
  | { kind: "where"; where: SQL };
```

## Behavior

| Scenario | Outcome |
| --- | --- |
| Member with `update: 'own'` edits someone else's row | Denied. The UI enables the control optimistically and the backend rejects on save. |
| Actor reads a row whose `publicAt` is set (entity declares `publicRead()`) | Allowed, `grantedBy: public`, single-row, in lists, and over SSE, anonymous included |
| Actor loses access mid-Yjs-session | Materialization re-checks `update` on the backend before persisting |
| System admin joins a Yjs collab session | No bypass. Authorized as the acting user, matching materialization |
