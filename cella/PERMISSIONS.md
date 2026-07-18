# Permissions: contextual RBAC

Cella answers one question everywhere: **may this actor perform this action on this subject?** The answer comes from a single decision engine in `shared/src/permissions/`, computed from the actor's memberships, a static role × context policy matrix, and the subject's own row data. The engine is tier-neutral and ORM-free, so the backend, the frontend, and the standalone Yjs relay all reach the same verdict from the same code — the relay authorizes without a backend round-trip.

Roles are **scoped to channel entities**, never global. Product entities own no roles at all: they inherit their permissions from ancestor contexts. Ownership is an *implicit* relation derived from the row's `createdBy` column rather than a stored tuple.

Postgres RLS is a **separate, coarser layer**. It enforces tenant isolation and knows nothing about roles, policies, or actions. See [Architecture](/docs/page/architecture) for how the two combine into defense in depth.

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
│  │   .user()                     │  │   subject × context × role → cell   │  │
│  │   .channel(name, {parent,     │  │   cell = 0 | 1 | 'own'              │  │
│  │             roles})           │  │   publicRead(mode)                  │  │
│  │   .product(name, {parent})    │  │   elevatedRoles                     │  │
│  │                               │  │                                     │  │
│  │ kinds, ancestor chains, roles │  │ → accessPolicies, publicReadGrants  │  │
│  └──────────────┬────────────────┘  └────────────────┬────────────────────┘  │
│                 │                                    │                       │
│                 └────────────────┬───────────────────┘                       │
│                                  ▼                                           │
│      ┌──────────────────────────────────────────────────────────┐            │
│      │      Permission engine — shared/, tier-neutral, ORM-free │            │
│      │                                                          │            │
│      │  getAllDecisions(policies, memberships, subject, opts)   │            │
│      │                                                          │            │
│      │  1. order contexts   most-specific → root                │            │
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
│   │ + compiled │ │ row, gates   │ │ no backend    │ │ can-map, drives│       │
│   │ SQL for    │ │ cacheToken   │ │ round-trip    │ │ UI affordances │       │
│   │ list reads │ │ issuance     │ │               │ │ (never trusted)│       │
│   └────────────┘ └──────────────┘ └───────────────┘ └────────────────┘       │
│                                                                              │
│  Postgres RLS (app.tenant_id) — separate layer, tenant isolation only.       │
│  Fail-closed on SELECT for tenant-scoped product tables. No role awareness.  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The engine **never loads rows**. Callers resolve whatever row data a decision needs and hand it in. That keeps `shared/` free of any ORM, makes the same function callable from a Postgres-only worker, and makes the check-form/SQL-form parity property testable.

## Vocabulary

| Term | Meaning |
|------|---------|
| **Channel entity** | Owns roles and memberships (`organization` in the template). Orders as `[self, ...ancestors]`. |
| **Product entity** | Owns no roles; inherits from ancestor contexts (`attachment`). Orders as `[...ancestors]`. Must have a context parent. |
| **User entity** | Carries no policies at all; `configurePermissions` filters it out. |
| **Membership** | The engine reads only `{ channelType, channelId, role }`. Explicit `user → context` relation. |
| **Subject** | What is being acted on: entity type, optional id, `channelIds` scope, and optionally `row`. |
| **Policy cell** | `0` (deny), `1` (allow), or a row-condition name (`'own'` — allow on qualifying rows). |
| **Action** | `create`, `read`, `update`, `delete` (`appConfig.entityActions`). |
| **Grant source** | Why an action was allowed: `membership`, `relation`, `public`, or `systemAdmin`. |

## Configuration

Two files, both fork-facing. They must change together — the hierarchy defines what contexts exist, the policies must then cover every role in every one of them.

**`shared/config/hierarchy-config.ts`** — a fluent builder, not an object literal:

```ts
export const roles = createRoleRegistry(['admin', 'member'] as const);

export const hierarchy = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();
```

**`shared/config/permissions-config.ts`** — declares the matrix and returns both maps:

```ts
export const { accessPolicies, publicReadGrants } = configurePermissions(
  appConfig.entityTypes,
  ({ subject, contexts }) => {
    switch (subject.name) {
      case 'organization':
        contexts.organization.admin({ read: 1, update: 1, delete: 1 });
        contexts.organization.member({ read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  },
);
```

Any action you omit defaults to `0`. `'own'` is the built-in owner condition: the engine reads the config cell verbatim (the name *is* the value), so it only ever sees `0 | 1 | 'own'`.

Missing actions and missing role/context rows both deny by default, so policies only need to declare
grants. Public-read declarations are collected separately because they are membership-independent.

For channel entities, note the two row kinds: **elevation** rows sit on an *ancestor* context and say what a parent's member may do to the child (this is where `create` lives); **self** rows sit on the same context and say what the entity's own members may do to it (`create` is meaningless there). Product entities have only *home* rows, where `create` grants making the product inside that context.

## The decision

`getAllDecisions(policies, memberships, subject, options)` is the core; `checkPermission` is the bound entry point every tier actually calls — it injects the configured `publicReadGrants` and `elevatedRoles`. Subjects and decisions are batchable, and batching is meaningfully faster than looping.

```ts
export type SubjectForPermission = {
  entityType: ChannelEntityType | ProductEntityType;
  id?: string;
  createdBy?: string | null;
  channelIds: ChannelScope;              // Partial<Record<ChannelEntityType, string | null>>
  row?: Record<string, unknown>;         // for row conditions + publicSelf
};

export interface PermissionDecision<T extends PermissionMembership = PermissionMembership> {
  subject: { entityType; id?; channelIds };
  actions: Record<EntityActionType, { enabled: boolean; grantedBy: GrantSource[] }>;
  can: Record<EntityActionType, boolean>;
  membership: T | null;
}
```

Ancestor scope is **explicitly tri-state**, and the distinction is load-bearing: `undefined` means a required scope was omitted and throws `MissingScopeError`; `null` means deliberately not scoped to that ancestor; a string means scoped to a concrete context id. Silently treating a missing scope as "unscoped" would be a permission bypass, so it is a hard error — surfaced as HTTP 400 `missing_scope` on the backend and WS close `4400` in the relay.

Boundary code that starts from DB rows, route params, or CDC events uses `buildSubject()` to turn column-shaped input (`{ organizationId: 'org_x' }`) into this domain shape. Internals read `subject.channelIds.organization`, never a DB column name.

`grantedBy` is not decoration. It records *why* an action was allowed, which is what makes "why can this user delete?" answerable, and it is what the audit path reads.

## Widening: row conditions and public read

Two mechanisms widen access beyond the policy matrix, and both read the row's own columns. There are exactly two rules — `own` and `public` — and that set is **closed**: it is not a fork extension point. The reasoning is in Constraints; the mechanism is here.

A **row condition** (`shared/src/permissions/row-conditions.ts`) qualifies a grant per row. A cell of `1` grants the action on every row the context scope reaches; a condition cell grants it only on rows the condition matches. Because the set is closed, a condition is just its **name** — the name determines the rule, so there is no descriptor to carry:

```ts
export type RowConditionName = 'own' | 'public';   // this union IS the contract

export const matchesRowCondition = (name: RowConditionName, row, actor): boolean => {
  switch (name) {
    case 'own':    return !!actor.userId && row.createdBy === actor.userId; // anonymous never matches
    case 'public': return !!row.publicAt;                                   // actor-independent
  }
};
```

The name is the single source of truth. Three paths map it to behaviour through an exhaustive `switch` — `matchesRowCondition` (JS, in `shared/`), `compileRowConditionSql` (Drizzle, in `backend/`), and the frontend `resolvePermission` (`action-helpers.ts`) — so their forms **cannot drift**: TypeScript's exhaustiveness makes adding a name a compile error in every one of them, and the parity property test proves the paths agree. The `shared/`→`backend/` split is why `shared/` emits only the name and the backend compiles the SQL: `shared/` is ORM-free.

**Public read** (`shared/src/permissions/public-read.ts`) makes rows readable by *any* actor, anonymous included, independent of memberships. One rule: the row's own `publicAt` is set. Declared per subject with `publicRead('publicSelf')`, it widens `read` and nothing else. It is *not* a policy cell — it grants with no membership — but it resolves through the same `'public'` row condition, so it rides the same switches and the same parity test.

## The actor

Every check takes an explicit `Actor`. It is a discriminated union, not an optional `userId`, and that shape is load-bearing:

```ts
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };
```

An optional actor is how permission bugs get in. A caller that simply forgets it still compiles, and every rule that reads the actor — `'own'`, and any fork condition — then silently fails **closed**: a denial nobody notices, in a path nobody tested. Anonymity has to be *stated*, not achieved by omission, and `{ anonymous: true }` cannot be produced by accident.

On the backend, handlers never assemble one by hand: `actorFrom(ctx)` reads the guard-populated `userId` and `isSystemAdmin` straight off the request context.

## Enforcement paths

The engine produces a verdict. Each tier is responsible for *asking* — and every one of them now asks with the same inputs.

| Path | Entry point | What it checks |
|------|-------------|----------------|
| **Guard chain** | `authGuard` → `tenantGuard` → `orgGuard` | Coarse gate only: authenticated, in-tenant, and a member of the org *or* a system admin. It does **not** consult `accessPolicies`. |
| **Single row** | `getValidProductEntity`, `getValidChannelEntity`, `canCreateEntity`, `splitByPermission` | Loads the row, passes it as `subject.row` via `buildSubjectFromEntity`, runs the engine. `splitByPermission` powers bulk ops and 403s only when *nothing* is allowed. |
| **Collection read** | `resolveCollectionReadFilter` → `buildCollectionReadWhere` | Turns the actor's access into a readable scope, then compiles it — unconditional grants, row conditions, and the public grant — into one Drizzle `SQL` predicate. Set-based, so it never materializes rows to reject them. |
| **SSE dispatch** | `canReceiveEntityEvent` | Runs the engine per event row. Notified rows are fetchable by seq, so over-notifying is a data leak, not just noise. |
| **Catchup views** | `resolveViewReadStatus` | Classifies a client-declared view prefix `ok`/`opaque`/`forbidden` on top of `resolveCollectionReadFilter`. Answers a DIFFERENT question than row reads: may the caller see the subtree's aggregate change signal (`hw:`/counts)? Rows leak content; summaries leak the existence and timing of others' activity — so `ok` requires PROOF (org-wide read, a subtree-scoped grant on the node, or — for `self` views — a home-scoped grant on the node), `opaque` discloses nothing, and `forbidden` appears only with no read scope in the org. See "Readability × answerability" in SYNC_ENGINE.md for the worked matrix. |
| **Yjs relay** | `canEditEntity` on WS upgrade | Reads the entity row and memberships over raw `pg` (table/column names derived via `toTableName`/`toColumnName`), then runs the same engine. |
| **Postgres RLS** | `tenantRead` / `tenantContext` | Tenant isolation only. Not a permission layer. |

One row-lifecycle check runs **before** the engine on every row path: unpublished drafts
(`publishedAt` null — an opt-in product-table column, see `shared/src/published-rows.ts`) are
visible to their author alone. SSE dispatch drops them for everyone, collection/delta reads
exclude them by predicate, the detail read 404s non-authors, the detail cache refuses to serve
them, and the yjs relay rejects non-author write connections. The engine itself has no draft
vocabulary — the column is the contract, and every check is introspection-guarded so tables
without the column are untouched.

Product `publishedAt` is distinct from channel `publishedAt`, which gates setup, and from
`publicAt`, which grants non-members read access.

Two rules keep these honest, and both were once broken:

- **The system-admin bypass applies everywhere**, including collection reads. A sysadmin passes `orgGuard` with *no membership*, so a membership-only scope resolver hands them an empty list while single-row reads of the very same rows succeed.
- **Public rows appear in lists.** A grant that only the single-row path honours is worse than no grant at all: the row is fetchable by id and pushed over SSE, but silently absent from every collection.

The collection path returns a deliberate **tri-state**, so that "no restriction" can never be confused with "no rows":

```ts
export type CollectionReadWhere =
  | { kind: 'all' }             // org-wide read: no scope restriction
  | { kind: 'none' }            // no readable scope: return [] without querying
  | { kind: 'where'; where: SQL };
```

A bare `undefined` WHERE would leak the table, which is exactly the bug this shape makes unrepresentable. In the same spirit, the compiled SQL for a row condition emits `false` for an anonymous actor, mirroring the check-form's deny.

## Testing the invariants

The load-bearing test is the parity property test in `backend/src/permissions/row-predicates.test.ts`, which runs against a real Postgres. It generates random policies, memberships, and actors, then asserts row-for-row that independent implementations agree: the engine's `getAllDecisions`, the compiled SQL executed against a scratch table, the frontend's `computeCan` + `resolvePermission`, and — under the real app config — SSE dispatch. It covers deep ancestor chains and `elevatedRoles` via a synthetic topology. A deterministic PRNG means failures reproduce.

That test is what lets the SQL compiler exist at all: two hand-written implementations of the same rule *will* drift, so the drift is pinned rather than trusted. `topology.ts` / `resolve-topology.ts` exist as the seam that makes this possible — they let tests drive the engine on a synthetic hierarchy without module mocks, so a two-level template config can still exercise deep-chain behavior.

**The scenario space is the test.** It varies `isSystemAdmin` and public read grants, and it must keep doing so: for a long time it pinned `isSystemAdmin: false` and generated no public rows, and *both* of the divergences listed above lived comfortably underneath it, green. A parity test only pins the axes it actually varies. If you add a dimension to the permission model, add it here in the same commit, and confirm the test goes red when you remove the fix.

The rest of the suite covers grant attribution, `'own'` denial when the actor or `createdBy` is absent, public read for anonymous actors, policy completeness, the `null`-vs-`undefined` scope distinction, and a perf floor (100 entities under 10 ms; batch at least 2× a loop).

## Behavior

| Scenario | Outcome |
|----------|---------|
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
