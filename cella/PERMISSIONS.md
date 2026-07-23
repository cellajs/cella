# Permissions: contextual RBAC

Cella answers one question everywhere: **may this actor perform this action on this subject?** The whole subsystem is one sentence: **you present an access, the policy is consulted, you get back permissions, and every permission names the grants that earned it.** A single decision engine in `shared/src/permissions/` computes the answer from the actor's memberships, a static role × channel policy matrix, and the subject's own row data. The engine is tier-neutral and ORM-free, so the backend, the frontend, and the standalone Yjs relay all reach the same verdict from the same code — the relay authorizes without a backend round-trip.

Roles are **scoped to channel entities**, never global. Product entities own no roles at all: they inherit their permissions from channels. Ownership is an _implicit_ relation derived from the row's `createdBy` column rather than a stored tuple.

Postgres RLS is a **separate, coarser layer**. It enforces tenant isolation and knows nothing about roles, policies, or actions. See [Multi-tenancy](./MULTI_TENANCY.md) for the database boundary and how the layers combine.

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
│  │             roles})           │  │   publicRead()                      │  │
│  │   .product(name, {parent})    │  │   elevatedRoles                     │  │
│  │                               │  │                                     │  │
│  │ kinds, ancestor chains, roles │  │ → policyMatrix, publicReadGrants    │  │
│  └──────────────┬────────────────┘  └────────────────┬────────────────────┘  │
│                 │                                    │                       │
│                 └────────────────┬───────────────────┘                       │
│                                  ▼                                           │
│      ┌──────────────────────────────────────────────────────────┐            │
│      │      Permission engine — shared/, tier-neutral, ORM-free │            │
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
│  Postgres RLS (app.tenant_id) — separate layer, tenant isolation only.       │
│  Fail-closed on SELECT for tenant-scoped product tables. No role awareness.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine **never loads rows**. Callers resolve whatever row data a decision needs and hand it in. That keeps `shared/` free of any ORM, makes the same function callable from a Postgres-only worker, and makes the check-form/SQL-form parity property testable.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Channel entity** | Owns roles and memberships (`organization` in the template). Orders as `[self, ...ancestors]`. |
| **Product entity** | Owns no roles; inherits from channels (`attachment`). Orders as `[...ancestors]`. Must have a channel parent. |
| **User entity** | Carries no policies at all; `configurePermissions` filters it out. |
| **Membership** | The engine reads only `{ channelType, channelId, role }` (`AccessMembership`). Explicit `user → channel` relation. |
| **Subject** | What is being acted on: entity type, optional id, `channelIds` scope, and optionally `row`. |
| **Policy cell** | `PolicyCell`: `0` (deny), `1` (allow), or a row-condition name (`'own'` — allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete` (`appConfig.entityActions`). |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |

Naming follows the one-sentence dataflow, three stages with three words, and the next three sections walk it in order. **Access** is what you present: identity plus memberships (`Access`, `AccessMembership`, `accessFrom(ctx)`). **Policy** is what is consulted: the configured matrix (`PolicyMatrix`, `PolicyCell`, `configurePermissions`). **Permission** is what you get back: per-action verdicts (`PermissionResult.allowed`, `PermissionDecision`, the `can` map). **Grant** is why you got it: the recorded sources behind each allowed action (`GrantSource`, `grantedBy`: `membership`, `relation`, `public`, or `systemAdmin`). Everything else reuses the hierarchy's vocabulary (`channel`, `home`, `entityType`); `subject` is the one engine-only noun, reserved for the checked instance.

## The access: what you present

Every `checkAccess*` call takes an explicit `Access` — the actor AND their memberships in one object:

```ts
export type Access<T extends AccessMembership = AccessMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };
```

`AccessMembership` is the minimal membership contract the engine reads: `{ channelType, channelId, role }`. Tier models may carry more fields; the generic threads the caller's full membership type through so the verdict can hand the matched membership back.

On the backend, handlers never assemble an access by hand: `accessFrom(ctx)` reads the guard-populated `userId`, `isSystemAdmin` and `memberships` straight off the request context, yielding a stated `{ anonymous: true }` when no user is signed in.

The compiled-predicate paths (the SQL twin: `compileRowConditionSql`, collection scopes, catchup reads) keep the membership-less `Actor` union and `actorFrom(ctx)` — memberships enter those paths as SQL scope, not as an engine argument.

## The policy: what is consulted

The policy is declared once, validated at boot, and never varies per request. Two files, both fork-facing. They must change together — the hierarchy defines what channels exist, the policies must then cover every role in every one of them.

**`shared/config/hierarchy-config.ts`** — a fluent builder, not an object literal:

```ts
export const roles = createRoleRegistry(["admin", "member"] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .channel("organization", { parent: null, roles: roles.all })
  .product("attachment", { parent: "organization" })
  .build();
```

**`shared/config/permissions-config.ts`** — declares the matrix and returns both maps:

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

Any action you omit defaults to `0`. `'own'` is the built-in owner condition: the engine reads the config cell verbatim (the name _is_ the value), so it only ever sees `0 | 1 | 'own'`.

Missing actions and missing role/channel rows both deny by default, so policies only need to declare grants. Public-read declarations are collected separately because they are membership-independent.

For channel entities, note the two row kinds: **elevation** rows sit on an _ancestor_ channel and say what a parent's member may do to the child (this is where `create` lives); **self** rows sit on the same channel and say what the entity's own members may do to it (`create` is meaningless there). Product entities have only _home_ rows, where `create` grants making the product inside that channel.

## The permission: what you get back

Presenting an access to the engine yields per-action verdicts. `getAllDecisions(policies, memberships, subject, options)` is the core; the **`checkAccess*` family** is the bound surface every tier actually calls — three named projections of the same engine, all injecting the configured `publicReadGrants` and `elevatedRoles`. The name at the call site tells you the shape:

```ts
checkAccess(access, action, subject); // → PermissionResult — the request-path check
checkAccessBatch(access, action, subjects); // → BatchPermissionResult — one actor, many rows (list splitting)
checkAccessFanout(accesses, action, subject, options?); // → PermissionResult[] — many actors, one row (stream fan-out)
```

`checkAccessFanout` is engine-collapsed: accesses are grouped into **access classes** (admin bit, one bit per row condition the subject's policies actually reference, roles held at the subject's channel levels) and the policy walk runs once per class, so cost scales with distinct classes — not with subscribers. The class-key guarantee (equal keys ⇒ equal decisions) is property-tested in `resolve-access.test.ts` against synthetic policies the template itself never ships. `options.onInvalidMembership: 'deny'` lets fan-out callers fail-close a single corrupt access instead of throwing away the batch.

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

Ancestor scope is **explicitly tri-state**, and the distinction is load-bearing: `undefined` means a required scope was omitted and throws `MissingScopeError`; `null` means deliberately not scoped to that ancestor; a string means scoped to a concrete channel id. Silently treating a missing scope as "unscoped" would be a permission bypass, so it is a hard error — surfaced as HTTP 400 `missing_scope` on the backend and WS close `4400` in the relay.

Boundary code that starts from DB rows, route params, or CDC events uses `buildSubject()` to turn column-shaped input (`{ organizationId: 'org_x' }`) into this domain shape. Internals read `subject.channelIds.organization`, never a DB column name.

`grantedBy` is the sentence's last clause made concrete: every permission names the grants that earned it. It records _why_ an action was allowed, which is what makes "why can this user delete?" answerable — through the debug formatters (`formatPermissionDecision`, `formatBatchPermissionSummary`) and the full `decisions` map batch callers get back.

## Row conditions

Two mechanisms widen access beyond the policy matrix, and both read the row's own columns. There are exactly two rules — `own` and `public` — and that set is **closed**, not a fork extension point: every rule must be evaluable in all three forms (JS, compiled SQL, frontend) _and_ by dispatch from the row alone, which rules out cross-row and fork-defined conditions.

A **row condition** (`shared/src/permissions/row-conditions.ts`) qualifies a grant per row: a cell of `1` grants the action on every row the channel scope reaches; a condition cell grants it only on rows the condition matches. Because the set is closed, a condition is just its **name**:

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

The name is the single source of truth. Three paths map it to behaviour through an exhaustive `switch` — `matchesRowCondition` (JS, in `shared/`), `compileRowConditionSql` (Drizzle, in `backend/`), and the frontend `resolveCan` (`action-helpers.ts`) — so their forms **cannot drift**: TypeScript's exhaustiveness makes adding a name a compile error in every one of them, and the parity property test proves the paths agree. The `shared/`→`backend/` split is why `shared/` emits only the name and the backend compiles the SQL: `shared/` is ORM-free.

**Public read** (`shared/src/permissions/public-read.ts`) makes rows readable by _any_ actor, anonymous included, independent of memberships. One rule: the row's own `publicAt` is set. Declared per subject with `publicRead()`, it widens `read` and nothing else. It is _not_ a policy cell — it grants with no membership — but it resolves through the same `'public'` row condition, so it rides the same switches and the same parity test.

## Enforcement paths

The engine produces a verdict. Each tier is responsible for _asking_ — and every one of them asks with the same inputs.

| Path | Entry point | What it checks |
| --- | --- | --- |
| **Guard chain** | `authGuard` → `tenantGuard` → `orgGuard` | Coarse gate only: authenticated, in-tenant, and a member of the org _or_ a system admin. It does **not** consult the policy matrix. |
| **Single row** | `getValidProduct`, `getValidChannel`, `canCreateEntity`, `splitByPermission` | Loads the row, passes it as `subject.row` via `buildSubjectFromEntity`, runs the engine (`canCreateEntity` is the exception: the entity doesn't exist yet, so the subject describes the would-be placement, no row). `splitByPermission` powers bulk ops and 403s only when _nothing_ is allowed. |
| **Collection read** | `resolveCollectionReadFilter` → `buildCollectionReadWhere` | Turns the actor's access into a readable scope, then compiles it — unconditional grants, row conditions, and the public grant — into one Drizzle `SQL` predicate. Set-based, so it never materializes rows to reject them. |
| **SSE dispatch** | `rowReadDecisions` (`canReceiveProductEvent` is its batch-of-1) | ONE `checkAccessFanout` call per event row over the channel's subscribers; the engine collapses them into access classes. Notified rows are fetchable by seq, so over-notifying is a data leak, not just noise. |
| **Catchup views** | `resolveViewReadStatus` | Classifies a client-declared view prefix `ok`/`opaque`/`forbidden` — a DIFFERENT question than row reads: may the caller see the subtree's aggregate change signal (`e:f:`/counts)? Summaries leak the existence and timing of others' activity, so `ok` requires proof of a grant on the node or a verified ancestor (claimed prefixes must equal the counters row's canonical path). See "Authorization: readability × answerability" in SYNC_ENGINE.md for the worked matrix. |
| **Yjs relay** | `canEditEntity` on WS upgrade | Reads the entity row and memberships over raw `pg` (table/column names derived via `toTableName`/`toColumnName`), then runs the same engine. |
| **Postgres RLS** | `tenantRead` / `tenantContext` | Tenant isolation only. Not a permission layer. |

One row-lifecycle check runs **before** the engine on every row path: unpublished drafts (`publishedAt` null — an opt-in product-table column, see `shared/src/published-rows.ts`) are visible to their author alone. The PRIMARY draft boundary sits below all of this: a publication row filter keeps draft product rows out of the replication stream entirely (publish arrives as INSERT, unpublish as DELETE — see SYNC_ENGINE.md), so the SSE dispatch veto is fail-closed defense-in-depth for a misconfigured fork, not the mechanism. The API-side checks remain load-bearing because the TABLE still contains drafts: collection/delta reads exclude them by predicate, the detail read 404s non-authors, the detail cache refuses to serve them, and the yjs relay rejects non-author write connections. The engine itself has no draft vocabulary — the column is the contract, and every check is introspection-guarded so tables without the column are untouched.

Product `publishedAt` is distinct from channel `publishedAt`, which gates setup, and from `publicAt`, which grants non-members read access.

Two rules bind every path: **the system-admin bypass applies to collection reads too** (a sysadmin passes `orgGuard` with no membership, so scope resolution must not be membership-only), and **any grant the single-row path honours must appear in lists and over SSE** — a row fetchable by id but absent from collections is worse than no grant.

The collection path returns a deliberate **tri-state**, so that "no restriction" can never be confused with "no rows":

```ts
export type CollectionReadWhere =
  | { kind: "all" } // org-wide read: no scope restriction
  | { kind: "none" } // no readable scope: return [] without querying
  | { kind: "where"; where: SQL };
```

A bare `undefined` WHERE would leak the table, which is exactly the bug this shape makes unrepresentable. In the same spirit, the compiled SQL for a row condition emits `false` for an anonymous actor, mirroring the check-form's deny.

## Testing & consistency

The load-bearing test is the parity property test in `backend/src/permissions/row-predicates.test.ts`, which runs against a real Postgres. It generates random policies, memberships, and actors, then asserts row-for-row that independent implementations agree: the engine's `getAllDecisions`, the compiled SQL executed against a scratch table, the frontend's `computeCan` + `resolveCan`, and — under the real app config — SSE dispatch. A deterministic PRNG means failures reproduce. This test is what lets the SQL compiler exist at all: two hand-written implementations of the same rule _will_ drift, so the drift is pinned rather than trusted. The `hierarchy` override option (`resolve-hierarchy.ts`) lets it drive the engine on a synthetic hierarchy without module mocks, so the two-level template config still exercises deep ancestor chains and `elevatedRoles`.

**The scenario space is the test.** A parity test only pins the axes it actually varies (`isSystemAdmin` and public read grants are axes, not constants). If you add a dimension to the permission model, add it here in the same commit, and confirm the test goes red when you remove the fix.

The rest of the suite covers grant attribution, `'own'` denial when the actor or `createdBy` is absent, public read for anonymous actors, policy completeness, the `null`-vs-`undefined` scope distinction, and a perf floor (`check.perf.test.ts`: 100 entities under 10 ms; a stable membership array must meaningfully beat rebuilding its index per call). The fan-out collapse has its own benchmark in `backend/…/dispatch-eligibility.perf.test.ts`.

## Behavior

| Scenario | Outcome |
| --- | --- |
| Org admin acts on a product in their org | Allowed unconditionally, `grantedBy: membership` |
| Member with `update: 'own'` edits a row they created | Allowed, `grantedBy: relation` (`own`) |
| Member with `update: 'own'` edits someone else's row | Denied. The UI optimistically enables the control; the backend rejects on save |
| Actor reads a row whose `publicAt` is set (entity declares `publicRead()`) | Allowed, `grantedBy: public` — single-row, in lists, and over SSE alike. Anonymous actors included |
| Row's parent is public but the row itself is not | Denied. Publication does not cascade through the engine; propagate `publicAt` to the row |
| System admin acts on any single row | Allowed, `grantedBy: systemAdmin`, short-circuited before membership lookup |
| System admin without an org membership lists a collection | Every row in the org. The bypass applies to the collection path too |
| Membership role has no policy row for the subject | Denies every action for that membership |
| Required ancestor scope omitted from `channelIds` | Throws `MissingScopeError` → 400 `missing_scope` / WS `4400`. Never silently unscoped |
| Actor loses access mid-Yjs-session | The relay's materialization re-checks `update` on the backend before persisting |
| System admin joins a Yjs collab session | No bypass. Collaborative editing is authorized as the acting user, matching materialization |
