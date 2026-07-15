# Permission actor + public read migration

Upstream reworked the permission engine so that **every enforcement path reaches the
same verdict from the same inputs**. Four paths did not, and each divergence was
invisible to cella's own tests (they need config cella doesn't ship), so a fork is
where they actually bite.

Three things change for forks: a **required `Actor`** on every permission check, a
**single-mode public read** backed by a denormalized `publicAt` column, and a **closed
row-condition set** (`own` + public read — no fork extension point). Each has its own section
below; the widening warning next is the one to read before you pull.

---

## ⚠️ Read this before you pull: this migration WIDENS access

Some permission cells that are **inert today start granting** after this change.

Before the fix, four call sites ran the engine without telling it who was acting. Any
rule that reads the actor — `'own'`, or any custom `RowCondition` — therefore could
not match, and the path **failed closed**. It denied. Silently. The affected paths:

| Path | Was |
|------|-----|
| `getValidChannelEntity` | no actor → `'own'` on a **channel entity** never matched |
| `canCreateEntity` | no actor → `'own'` on a **create** row never matched |
| `getPresignedUrlOp` | no actor → `'own'` never matched |
| Yjs relay (`canEditEntity`) | no actor → `'own'` **update** grants never matched, so collab was denied |

**Audit your `permissions-config.ts` before pulling.** Grep for `'own'` (and any custom
row condition) in:

- rows on a **channel-entity subject** (`case 'project': contexts.project.member({ update: 'own' })`)
- the **`create`** cell of any row

Those cells were dead. After this change they come alive and grant. That is the intended
behavior — it is what the cell always said — but it arrives via a routine template pull,
and **no test on either side will go red**. Confirm each one is what you actually meant.

Cells that only affect `read`/`update`/`delete` on *product* subjects were already working
(`getValidProductEntity` and `splitByPermission` always passed the actor). Those are unchanged.

---

## 1. `Actor` is now required on `checkPermission`

```ts
export type Actor = { userId: string; isSystemAdmin?: boolean } | { anonymous: true };
```

A discriminated union, not an optional `userId` — because an optional actor is exactly how
these bugs got in. A caller that forgets it still compiles, and the check then fails closed.
Anonymity now has to be *stated*; `{ anonymous: true }` cannot be produced by accident.

**Backend handlers** should never build one by hand:

```diff
- const { isAllowed } = checkPermission(memberships, action, subject, { isSystemAdmin });
+ const { isAllowed } = checkPermission(memberships, action, subject, actorFrom(ctx));
```

`actorFrom(ctx)` (`backend/src/permissions/actor.ts`) reads the guard-populated `userId` and
`isSystemAdmin` off the request context. The compiler will find every call site for you.

## 2. Collection reads take the actor too

`resolveCollectionReadFilter` and `buildCollectionReadWhere` now require it, and
`resolveCollectionReadFilterForPolicies` takes an options object:

```diff
- const filter = resolveCollectionReadFilter(ctx.var.memberships, 'task', organizationId);
- const where = buildCollectionReadWhere(filter, tasksTable, tasksTable.projectId, ctx.var.user.id);
+ const actor = actorFrom(ctx);
+ const filter = resolveCollectionReadFilter(ctx.var.memberships, 'task', organizationId, actor);
+ const where = buildCollectionReadWhere(filter, tasksTable, tasksTable.projectId, actor);
```

This fixes a real bug: **system admins used to get an empty list.** A sysadmin passes
`orgGuard` with *no membership*, and the old membership-only resolver gave them no scope —
while single-row reads of the very same rows succeeded.

> **Behavior change to confirm, not just a fix.** After sync a system admin lists **every row in the
> org** for collection reads (previously they were scoped by membership like anyone else). This is
> intended — it matches single-row and SSE behavior — but it is a visible change for a fork that
> relied on the old scoping. The one deliberate exception is `getUnseenCounts`, which stays grouped by
> membership (a sysadmin with no memberships gets no badges); cella pins that with a regression test.

## 3. Public read: one mode, one column — **this is the section that can break a live feature**

`publicParent` and `publicParentOrSelf` are **removed**, along with `subject.parentRow`. Public
readability is now purely row-local: `publicAt IS NOT NULL` on the row itself.

Be clear about *why*, because it is not "the old modes were broken." A `publicParent` grant works
correctly on a **single-row** path where the caller resolves the parent and passes it as
`parentRow` (raak does exactly this for public task share links). What it *cannot* do is be
enforced on the **collection-read** path (the SQL compiler would need a join) or in **CDC dispatch**
(which only ever ships the row itself). So it is a mode that is correct in one path and silently
wrong in two — a footgun the closed model refuses to carry. `publicSelf`, by contrast, compiles
identically in the check-form, in collection SQL, and in dispatch, so a public row appears in list
endpoints too.

**So this rewrite is semantically lossy, not mechanical.** Do not hand-edit blindly — use the codemod,
which rewrites *and reports* every affected entity so you can decide what each one needs:

```sh
# from repo root — inventory FIRST, it writes nothing
pnpm exec tsx cella/migrations/2026-07-permission-actor/publicread-codemod.ts inventory shared/config/permissions-config.ts
pnpm exec tsx cella/migrations/2026-07-permission-actor/publicread-codemod.ts rewrite   shared/config/permissions-config.ts
```

For each entity it reports, choose:

- **It was genuinely public-via-parent (a live feature).** Denormalize `publicAt` onto its rows:
  populate on parent-publish + backfill, using [`publicat-cascade.template.sql`](./publicat-cascade.template.sql).
  Then rewrite any anonymous read handler to drop `parentRow` and read the row's own `publicAt`.
- **It was dormant / never actually served publicly.** The rewrite to `publicSelf` is free; nothing
  to populate.

### Worked examples (the two known forks)

- **raak — a LIVE break.** `task` uses `publicParent` and is served anonymously via public share
  links (`task/public-handlers.ts` resolves the project and passes `parentRow`). After the rewrite,
  public tasks 403 until you denormalize `task.publicAt` (its column exists but nothing populates it)
  and rewrite the handler. `attachment` also declares `publicParent` but has **no `publicAt` column**
  and no anonymous route — latent, but still a compile error to fix. `project` uses `publicSelf` and
  is unaffected.
- **projectcampus — DORMANT, near-trivial.** `item` and `comment` use `publicParentOrSelf`, but there
  is no anonymous surface and `parentRow` was never populated (Phase P8). `comment` already copies
  `publicAt` from its item, so `publicSelf` reproduces intent exactly. Net: two one-line config edits,
  no runtime change; the real cascade is deferred until a public surface ships.

### `publicAt` base-column collision — reconcile your schema

`public_at` is now provided by the channel + product base column helpers (`channelEntityColumns` /
`productEntityColumns`). If your fork **hand-rolled** a `publicAt` column on any table, it will be
**double-defined** after sync — drop the hand-written one and inherit the base column.

- raak: hand-rolls it on `project-db.ts`, `task-db.ts` → remove both.
- projectcampus: hand-rolls it on `project-db.ts`, `item-db.ts`, `comment-db.ts` → remove all three.

Then `pnpm --filter backend generate` and review the migration (adding the nullable base column is a
metadata-only `ALTER`; removing a redundant identical column is too).

> **Three lookalike columns, three meanings** — `publishedAt` (channel entities, defaults `now()`)
> gates **members**: null = draft. `publicAt` grants **non-members**: null = not public.
> `attachments.public` is an S3 bucket-visibility boolean, unrelated to permissions. Don't conflate them.

---

## 4. Add your new axes to the parity test

`backend/src/permissions/row-predicates.test.ts` is the only thing standing between you and the
next divergence — and it was green through *both* of the bugs above, because its scenario space
pinned `isSystemAdmin: false` and generated no public rows.

**A parity test only pins the axes it actually varies.** If you add a policy dimension or a new
enforcement path, extend the scenario generator in the same commit — then confirm the test goes
**red** when you remove the fix. If it stays green, it isn't covering you.

## 5. Row conditions are now a closed set

The same change froze row conditions to exactly two — `own` and public read — defined only in
`shared/`. A condition is now pure data (`{ name, predicate }`) with a two-kind `RowPredicate`
vocabulary; the JS and SQL forms derive from one descriptor, so they can't drift.

This is deliberately **not** a fork extension point. There is no supported way to add a condition
from fork code — doing so means editing the shared engine and both interpreters, a considered
change, not a config knob. If you had layered a custom `RowCondition`, `PermissionValue` (now
`0 | 1 | 'own'`) will reject it at compile time; fold the logic into the engine or reconsider
whether it belongs in the permission model at all. Because the set is closed, CDC's
`permissionRowKeys` is fixed (`createdBy` + `publicAt`, both already shipped) — nothing to add.

Note `create: 'own'` is now **rejected at boot** (`configurePermissions` throws): a row condition on
create can never match (no row exists yet). If you had one, it was silently denying anyway — replace
it with `1` or `0`.

## 6. Frontend: resolve the three-state `can` in one place

`computeCan` emits `true | false | 'own'`. If your fork has any `'own'` cell, that `'own'` reaches the
frontend `can` map — and hand-rolled collapses disagree on it: `=== true` denies an owner who *can*
edit, while `!!` / `?? false` treat the `'own'` string as allowed for everyone. cella now routes
per-entity reads through `useResolveCan` (`frontend/src/modules/entities/use-resolve-can.ts`), which
resolves `'own'` against the entity's creator and the current user. Adopt the same in your fork's
readers (they are fork-owned files, so they don't update on sync):

- **Per-entity affordance** ("can I edit *this* row?") → `useResolveCan()(state, entity.createdBy)`.
- **Context-scoped affordance** that can't resolve per-row ownership up front (e.g. offering collab
  editing on an entity type) → `isUnconditionalPermission(state)` from `shared` (enables only on an
  unconditional grant, never on `'own'`). `isUnconditionalPermission` is a stable exported helper — if
  your fork already uses it (raak gates Yjs collab on it), it keeps working.

## 7. Test helper import moved

`configureAccessPolicies` (test-only) is off the public `shared` barrel — import it from
`shared/testing/policies` instead. Update your test files:

```diff
- import { configureAccessPolicies } from 'shared';
+ import { configureAccessPolicies } from 'shared/testing/policies';
```

---

## Checklist

- [ ] Audited every `'own'` cell on **channel-entity** and **create** rows (§ widening)
- [ ] `checkPermission` call sites pass `actorFrom(ctx)` (compiler-enforced)
- [ ] Collection-read call sites pass the actor (compiler-enforced); **sysadmin-lists-whole-org** change confirmed (§2)
- [ ] Ran `publicread-codemod.ts` (inventory then rewrite); each reported entity denormalized or confirmed dormant (§3)
- [ ] Anonymous public-read handlers drop `parentRow`, read the row's own `publicAt` (§3)
- [ ] Hand-rolled `publicAt` columns removed in favor of the base column (§3)
- [ ] `create: 'own'` cells replaced with `1`/`0` (now a boot error)
- [ ] Frontend `.can` readers routed through `useResolveCan` / `isUnconditionalPermission` (§6)
- [ ] `configureAccessPolicies` test imports moved to `shared/testing/policies` (§7)
- [ ] `pnpm --filter backend generate` run; `public_at` migration reviewed
- [ ] Parity test scenario space extended for any fork-specific dimension
- [ ] `pnpm ts`, `pnpm lint`, and the permission suites pass
