# One permission surface: `checkPermission` → the `checkAccess*` family

Upstream collapsed the permission engine's public surface to **one named family over one engine**. `checkPermission(memberships, action, subject, actor)` is gone; every JS-tier check now goes through one of three named projections — the name at the call site tells you the shape, and greps like `checkAccessFanout` find every fan-out site:

```ts
checkAccess(access, action, subject); // → PermissionResult (the request-path check)
checkAccessBatch(access, action, subjects); // → BatchPermissionResult (one actor, many rows)
checkAccessFanout(accesses, action, subject, options?); // → PermissionResult[] (many actors, one row)
```

with the actor and their memberships fused into one object:

```ts
export type Access<T extends PermissionMembership = PermissionMembership> =
  | { userId: string; isSystemAdmin?: boolean; memberships: T[] }
  | { anonymous: true };
```

**No permission semantics change for existing call shapes.** A single-access `checkAccess` call computes exactly what `checkPermission` computed, via the same `getAllDecisions` core; the three functions are thin projections of that one engine with the same injected config, so "one entry point" holds at the semantic level. What's new: `checkAccessFanout` collapses actors into access classes inside the engine (SSE dispatch rides this), and `{ anonymous: true }` can no longer carry memberships — anonymity and membership were contradictory, now the type forbids it.

The compiled-SQL paths are **untouched**: `Actor`, `actorFrom(ctx)`, `compileRowConditionSql`, `resolveCollectionReadFilter`, `buildCollectionReadWhere`, `resolveViewReadStatus` keep their signatures. Only call sites of `checkPermission` itself migrate.

## Migration (compiler-driven, no script)

Pull, run `pnpm ts`, and fix every `checkPermission` error mechanically:

**1. Backend handlers / helpers** — swap helper + fuse arguments:

```diff
- import { checkPermission } from '#/permissions';
- import { actorFrom } from '#/permissions/actor';
+ import { checkAccess } from '#/permissions';
+ import { accessFrom } from '#/permissions/actor';

- const { isAllowed } = checkPermission(ctx.var.memberships, 'read', subject, actorFrom(ctx));
+ const { isAllowed } = checkAccess(accessFrom(ctx), 'read', subject);
```

`accessFrom(ctx)` (`backend/src/permissions/actor.ts`) reads `userId`, `isSystemAdmin` AND `memberships` off the guard-populated context, and yields a stated `{ anonymous: true }` when no user is signed in. If your fork passed memberships that did NOT come from `ctx.var.memberships` (e.g. a target user's memberships), build the access object explicitly — the fused shape is the point: identity and memberships can no longer disagree.

**2. Non-context callers** (workers, relays — cf. `yjs/src/data/permissions.ts`):

```diff
- const { isAllowed } = checkPermission(memberships, 'update', subject, { userId, isSystemAdmin: false });
+ const { isAllowed } = checkAccess({ userId, isSystemAdmin: false, memberships }, 'update', subject);
```

**3. Batch-subjects callers** (cf. `splitByPermission`): swap to the named batch form — `checkAccessBatch(access, action, subjects)` returns the same `{ results, decisions }` shape:

```diff
- const { results } = checkPermission(memberships, action, subjects, actorFrom(ctx));
+ const { results } = checkAccessBatch(accessFrom(ctx), action, subjects);
```

**4. Fan-out callers** (dispatch-shaped fork code): `checkAccessFanout(accesses, action, subject, { onInvalidMembership: 'deny' })` — one call per row over many actors, engine-collapsed.

**5. Test mocks** — `vi.mock('#/permissions', …)` doubles of `checkPermission` rename to whichever family member the code under test calls (`checkAccess` / `checkAccessBatch` / `checkAccessFanout`); `actorFrom` doubles used on engine paths rename to `accessFrom` and must return an access-shaped object (add `memberships: []`).

## SSE dispatcher: `shouldReceive` → `selectEligible`

`DispatcherConfig` (`backend/src/modules/entities/stream/types.ts`) replaced the per-subscriber callback with one batch call, so the engine can collapse subscribers into classes:

```diff
- shouldReceive: (subscriber, event) => boolean
+ selectEligible: (subscribers, event) => subscribers[]
```

If your fork defines its own dispatcher config or overrides the app-stream one, wrap your old predicate: `selectEligible: (subs, event) => subs.filter((s) => oldShouldReceive(s, event))` — correct, just without the collapse. To get the collapse, compose `rowReadDecisions(subscribers, scopedEvent)` per row the way `dispatch-to-stream.ts` does (undecided-pool loop). `canReceiveEntityEvent` still exists with its old signature (now a batch of one) — fork code and parity tests that call it keep working.

## Behavior notes (read before you pull)

- **No widening, no narrowing** of any grant. The `2026-07-permission-actor` audit does not need repeating.
- **Malformed memberships in dispatch now deny silently per subscriber** (`onInvalidMembership: 'deny'`) instead of deny-with-log per check. Request paths keep throwing.
- **Fan-out cost model changed**: dispatch eligibility went from one engine walk per subscriber per row to one per access class per row (measured ~5–8× less dispatch CPU on 3–5k-subscriber orgs; see `dispatch-eligibility.perf.test.ts`). No action needed; just don't re-introduce per-subscriber `canReceiveEntityEvent` loops in fork dispatch code.
- If your fork extended `Actor` or duck-typed it into `checkPermission`, the fused `Access` object is where that extension now lives — extend `EngineAccess`-consuming code, not the SQL-twin `Actor`.

## Gates

`pnpm ts` finds every call site (the old name no longer exists — there is no deprecation alias). Then biome, then backend + shared test suites. The engine guarantee backing the class collapse is `shared/src/permissions/permission-manager/resolve-access.test.ts`; run it if you touch `resolve-access.ts`, `check.ts`, or `row-conditions.ts`.
