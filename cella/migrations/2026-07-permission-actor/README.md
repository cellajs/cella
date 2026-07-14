# Permission actor + public read migration

Upstream reworked the permission engine so that **every enforcement path reaches the
same verdict from the same inputs**. Four paths did not, and each divergence was
invisible to cella's own tests (they need config cella doesn't ship), so a fork is
where they actually bite.

Two things change for forks: a **required `Actor`** on every permission check, and a
**single-mode public read** backed by a denormalized `publicAt` column.

---

## ⚠️ Read this before you pull: this migration WIDENS access

Some permission cells that are **inert today start granting** after this change.

Before the fix, four call sites ran the engine without telling it who was acting. Any
rule that reads the actor — `'own'`, or any custom `RowCondition` — therefore could
not match, and the path **failed closed**. It denied. Silently. The affected paths:

| Path | Was |
|------|-----|
| `getValidContextEntity` | no actor → `'own'` on a **context entity** never matched |
| `canCreateEntity` | no actor → `'own'` on a **create** row never matched |
| `getPresignedUrlOp` | no actor → `'own'` never matched |
| Yjs relay (`canEditEntity`) | no actor → `'own'` **update** grants never matched, so collab was denied |

**Audit your `permissions-config.ts` before pulling.** Grep for `'own'` (and any custom
row condition) in:

- rows on a **context-entity subject** (`case 'project': contexts.project.member({ update: 'own' })`)
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

## 3. Public read: one mode, one column

`publicParent` and `publicParentOrSelf` are **removed**, along with `subject.parentRow`.

They could not work. Nothing ever populated `parentRow`, so a `publicParent` grant matched
nowhere — and it never could have been enforced anyway: the collection-read SQL compiler
would need a join, and CDC stream dispatch only ever ships the row itself. Three paths,
three different answers.

```diff
- publicRead('publicParent');
+ publicRead('publicSelf');
```

Public readability is now a property of the row: `publicAt IS NOT NULL`. Every context and
product row carries the column (`contextEntityColumns` / `productEntityColumns`), nullable
and dormant. `publicSelf` compiles identically in the check-form, in collection SQL, and in
dispatch — so a public row now actually **appears in list endpoints**, which it previously
did not.

If you declared `publicParent`, TypeScript will reject it. Pick one:

- **Publish the row itself** — set `publicAt` on the child. Simplest, and usually what was meant.
- **Cascade in the data** — a trigger on the parent's `publicAt` that propagates to descendants.
  Publication is a *data* concern now; the permission engine just reads the column.

### Schema

Run `pnpm --filter backend generate` to pick up `public_at` on your own entity tables. Adding a
nullable column with no default is a metadata-only `ALTER` in Postgres, so it does not rewrite
the table even on large forks.

> **`publicAt` vs `publishedAt`** — cella has both, and they are unrelated. `publishedAt` (context
> entities, defaults to `now()`) gates **members**: null means draft. `publicAt` grants **non-members**:
> null means not public. Note also that `attachments.public` is an S3 bucket-visibility boolean and
> has nothing to do with either.

---

## 4. Add your new axes to the parity test

`backend/src/permissions/row-predicates.test.ts` is the only thing standing between you and the
next divergence — and it was green through *both* of the bugs above, because its scenario space
pinned `isSystemAdmin: false` and generated no public rows.

**A parity test only pins the axes it actually varies.** If your fork adds a row condition, a
policy dimension, or a new enforcement path, extend the scenario generator in the same commit —
then confirm the test goes **red** when you remove the fix. If it stays green, it isn't covering you.

## 5. Custom row conditions: CDC must ship the column

If you add a `RowCondition` reading a new column, add that column to `permissionRowKeys` in
`cdc/src/utils/permission-row-data.ts`. Otherwise SSE dispatch never sees it and **fails closed** —
subscribers silently stop receiving rows they can read.

---

## Checklist

- [ ] Audited every `'own'` / custom-condition cell on **context-entity** and **create** rows (§ widening)
- [ ] `checkPermission` call sites pass `actorFrom(ctx)` (compiler-enforced)
- [ ] Collection-read call sites pass the actor (compiler-enforced)
- [ ] `publicRead('publicParent'|'publicParentOrSelf')` rewritten to `'publicSelf'` (compiler-enforced)
- [ ] `pnpm --filter backend generate` run; `public_at` migration reviewed
- [ ] Fork-specific row conditions added to CDC `permissionRowKeys`
- [ ] Parity test scenario space extended for any fork-specific dimension
- [ ] `pnpm ts`, `pnpm lint`, and the permission suites pass
