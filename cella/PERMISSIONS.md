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
| **Actor** | Who acts: a user or a service account, one row in `actors` either way. `actor.id` is what provenance columns and the `own` condition compare against. |
| **Binding** | A role on a channel, whoever holds it: a membership row for a user, a stored binding for a service account. `actor.bindings` is what the guards and the engine read. |
| **Subject** | What is acted on: entity type, optional id, `channelIds` scope, optionally `row`. |
| **Policy cell** | `0` (deny), `1` (allow), or a row-condition name (`'own'` in policies: allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete` (`appConfig.entityActions`). |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |
| **Access scope** | The mask an API key or access token puts over its actor's bindings: `<type>:read` or `<type>:write` per entity type with a policy. `null` is unmasked. |

## The access you present

Every `checkAccess*` call takes an explicit `Access`, actor plus memberships:

```ts
export type Access<T extends AccessMembership = AccessMembership> =
  | { actorId: string; isSystemAdmin?: boolean; memberships: T[]; scopes: readonly AccessScope[] | null }
  | { anonymous: true };
```

Backend handlers never assemble an access by hand: `accessFrom(ctx)` reads the guard-populated actor (`id`, `bindings`, `scopes`) and `isSystemAdmin` off the request context and yields `{ anonymous: true }` when nobody is signed in. `scopes` is required so a hand-built access states its mask: a session passes `null`; an API key or an access token passes what it was issued with, and the decision is `allowed AND the scope covers the action`. Where scopes come from: [Interoperability](./INTEROPERABILITY.md#access-scopes).

A user's bindings are their memberships, which each process caches under `actors.bindings_version`. A trigger on `memberships` gives that column a new random value on every insert, update and delete, cascades included. A token request reads the version at every use. A session request takes it from the cached session, which the writing operation drops (`invalidateCache.user`) and the API process drops when CDC reports the membership change, so a change counts within CDC lag there and within the session cache's 10 seconds elsewhere, whatever wrote it.

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

Ancestor scope is **tri-state**. `undefined` means a required scope was omitted and throws `MissingAncestorError` (HTTP 400 `missing_ancestor`, WebSocket close `4400`). `null` means explicitly not scoped to that ancestor. A string is a concrete channel id. A missing scope never defaults to unscoped, which would bypass permissions.

## Row conditions

Two mechanisms widen access beyond the policy matrix, both reading the row's own columns. The set is **closed** to `own` and `public`: every rule must be evaluable in JS, compiled SQL, the frontend, and by dispatch from the row alone, so no cross-row or app-defined conditions.

A **row condition** (`shared/src/permissions/row-conditions.ts`) qualifies a grant per row: a cell of `1` grants on every row in channel scope, a condition cell only on matching rows. A condition is just its **name**:

```ts
export type RowConditionName = "own" | "public"; // this union IS the contract
```

**Public read** (`shared/src/permissions/public-read.ts`) makes rows with their own `publicAt` set readable by any actor, anonymous included, independent of memberships. Declared per subject with `publicRead()`, it widens `read` only. It is not a policy cell, but it resolves through the same `'public'` row condition and parity test.

Two row columns sit beside the engine: drafts (`publishedAt`) are visible to their author alone and checked before the engine ([Drafts](./SYNC_ENGINE.md#drafts)). Visibility (`publicAt`) is row-local, set by the client on create, and never cascades.

## Frontend map

`computeCan(channelType, membership, policyMatrix)` derives the `can` map the UI reads (`entity.can[entityType][action]`) from one membership: the channel's own cells plus every descendant type's cells for that channel and role. A cell reaches the UI as `true`, `false` or a condition the frontend resolves per row with `resolveCan(state, createdBy, actorId, home)`:

| State | Resolves to | Where it comes from |
| --- | --- | --- |
| `'own'` | the actor created the row | the policy cell |
| `'home'` | the row is homed at the map's channel: `home.row` (its deepest non-null ancestor id, `hierarchy.resolveDeepestAncestorId(type, row)`) equals `home.channel` | a `1` cell of a home-scoped grant |
| `'home:own'` | both | an `'own'` cell of a home-scoped grant |

`'home'` is the map's form of the engine's home scoping: a role outside `hierarchy.elevatedGrants` reaches only product rows homed at its own channel, so that membership's product cells carry the mark, except `create` (no row: the frontend creates at the map's channel, the new row's home) and grants at the product's declared parent (every row below is homed there). Channel entries are never marked: the engine scopes product subjects only. A call without `home` denies the marked states, so every product row affordance passes `{ row, channel }`; channel-wide features use `isUnconditionalCan`. The map shapes the interface only: `shared/src/permissions/compute-can.test.ts` runs every role, channel and action of a hierarchy with elevated and home-scoped roles against the engine, on rows homed at the channel and below it, and the two agree.

## Enforcement paths

| Path | Guard or helper | What it checks | On failure |
| --- | --- | --- | --- |
| Guard chain | `userGuard` → `tenantGuard` → `orgGuard` | Authenticated, in-tenant (member, system admin, or the tenant's creator while it has no organization), org member or system admin. Never consults the policy matrix. | 401 or 403 before the handler; the tenant is one 403 whether missing, inactive or not the actor's, the organization one 404 whether missing or without a foothold ([Refusals](#refusals)) |
| Single row | `getValidProduct`, `getValidChannel` via `buildSubjectFromEntity` | Loads the row, rejects it outside the request tenant or organization, passes it as `subject.row`, runs the engine | 404 for a row that is missing, out of scope, a draft of someone else or one the caller may not read; 403 only for an action denied on a row the caller reads |
| Create | `canCreateEntity` | No row exists yet. The subject describes the would-be placement | 403 |
| Bulk | `splitByPermission` | Splits allowed from denied | 403 only when nothing is allowed |
| Collection read | `resolveCollectionReadFilter` → `buildCollectionReadWhere` | Compiles readable scope, row conditions, and the public grant into one Drizzle `SQL` predicate. Never materializes rows to reject them. | `{ kind: 'none' }` returns `[]` without querying; a home channel named in the query outside the readable scope is 404 |
| SSE dispatch | `rowReadDecisions` (`canReceiveProductEvent` is its batch-of-1) | One `checkAccessFanout` per event row over the channel's subscribers | Subscriber not notified. Over-notifying leaks data because notified rows are fetchable by seq |
| Catchup views | `resolveViewReadStatus` | May the caller see the subtree's aggregate change signal (`e:f:`/counts)? `ok` needs a grant on the node or a verified ancestor. Claimed prefixes must equal the counters row's canonical path ([Access](./SYNC_ENGINE.md#access)) | `opaque` or `forbidden` |

Two rules bind every path: **the system-admin bypass applies to collection reads too** (a sysadmin passes `orgGuard` with no membership, so scope resolution must not be membership-only), and **any grant the single-row path honours must appear in lists and over SSE**. The collection path returns a **tri-state** so "no restriction" is never confused with "no rows":

```ts
export type CollectionReadWhere =
  | { kind: "all" } // org-wide read: no scope restriction
  | { kind: "none" } // no readable scope: return [] without querying
  | { kind: "where"; where: SQL };
```

## Refusals

One answer per situation, so no route, app or test meets two shapes for one cause. A refusal the caller's request or state brings about carries severity `warn` (a warning toast, no log id); `error` is kept for the app's own faults, such as a row that must exist and is gone.

Unexpected server errors include internal details in client responses only in development and test. Other modes return a log ID; failed queries are logged without SQL or values.

| Situation | Answer | Why |
| --- | --- | --- |
| The tenant: missing, inactive, none of the actor's, or not the tenant an API key belongs to | 403 `forbidden`, `meta.resource: 'tenant'` | The tenant is the URL segment every member knows, so the answer only says "not yours"; one answer for every case keeps the six-character ids from being enumerated |
| Anything under a tenant the caller may not read, missing and unreadable alike: an organization (`orgGuard`), a channel or product (`getValidChannel`, `getValidProduct`: out of scope, soft-deleted, someone else's draft, read denied), a home channel named in a list query, an invitation | 404 `not_found` with `entityType`; an invitation carries `meta.resource: 'invitation'` | A 403 would confirm the id. The access is the actor masked by its scopes, so an API key or access token without the entity's scope reads it as missing too |
| An action denied on a row the caller reads; a create the placement denies; a bulk call where nothing is allowed | 403 `forbidden`, `entityType`, and `meta.action` for a single row | The caller already knows the row |
| A list option the caller may not use: the system role as filter or sort of `getUsers` for anyone but a system admin; another user's `role` or `excludeArchived` in `getOrganizations` | 403 `forbidden`, `meta.reason` | Refused, never dropped: a dropped option answers a narrower question with the wider list. A sort is never refused; the `displayOrder` default names the caller's own menu, so another user's list comes by name |
| Another user the caller shares no organization with (`relatableGuard`, `getUser`), missing and unshared alike | 403 `forbidden`, `entityType: 'user'` | The guard answers before validation and never loads the user; one answer hides existence as a 404 would |
| A token this browser does not hold: no cookie, an unknown or spent value, a URL that names another token | 401 `<type>_not_found`; expired, 401 `<type>_expired` with `meta.tokenId` so the error page can offer a new link | The proof is the cookie, for a link and a cookie-carried type alike. These keys are spelled after the token type (`confirm-mfa_not_found`, `step-up_expired`); the step-up feature's own keys are snake_case (`step_up_required`) |
| A link or invitation of another account: opened while signed in as someone else, bound to another user, or the race that binds it lost | 409 `user_mismatch` | The request conflicts with the signed-in account, not with its own shape |
| An address or provider account another account holds (`oauth_email_exists`, `oauth_conflict`, `oauth_wrong_email`) | 409, severity `warn` | The caller's state, not a fault of the app |
| Not signed in, or a session that ended | 401 `unauthorized`, `no_session`, `session_expired` or `session_revoked` | The frontend redirects to sign-in on these types alone; any other 401 refuses a proof while signed in |
| An account-security route without a recent proof of presence | 403 `step_up_required` naming the methods | [Interoperability](./INTEROPERABILITY.md#guards) |
| An action on the account itself while impersonating: stepping up, revoking the user's sessions, impersonating again, and every `stepUpGuard` route | 403 `impersonation_forbidden` (`noImpersonationGuard`; `stepUpGuard` gives the same answer before its own) | The admin acts as the user, never on the account, its sessions or how it is protected |

## Behavior

| Scenario | Outcome |
| --- | --- |
| Member with `update: 'own'` edits someone else's row | Denied. The UI enables the control optimistically and the backend rejects on save. |
| Actor reads a row whose `publicAt` is set (entity declares `publicRead()`) | Allowed, `grantedBy: public`, single-row, in lists, and over SSE, anonymous included |
| Actor loses access mid-Yjs-session | The socket closes when its five-minute token expires, and a reconnect is authorized again. Materialization credits the newest editor who still has `update` |
| System admin joins a Yjs collab session | No bypass. Authorized as the acting user, matching materialization |
