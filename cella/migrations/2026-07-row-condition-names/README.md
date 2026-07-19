# Row conditions collapse to a name union

Upstream simplified the row-condition model. It was built when a row condition was meant to be a _dynamic, fork-extensible_ rule — a `RowCondition` object carrying a `{ kind, column }` `RowPredicate` descriptor, read by two interpreters. In practice the set is closed to exactly two rules (`own`, `public`), so the descriptor was redundant: the rule **name** already determines its behaviour. The name is now the single source of truth, and each enforcement path maps it through an exhaustive `switch`.

**This is a shape-only refactor. It does NOT change permission semantics.** No cell grants anything it did not grant before; the `'own'` / `'public'` names are frozen; the config surface (`read: 'own'`, `publicRead('publicSelf')`) is untouched. Unlike [2026-07-permission-actor](../2026-07-permission-actor/) — which _widened_ access and needed a pre-pull audit — this one is mechanical and **entirely compiler-enforced**: if it type-checks, it is correct. Most forks need to change nothing.

---

## Does my fork need to do anything?

Row conditions have been a **closed set defined only in `shared/`, not a fork extension point**, since 2026-07-permission-actor (§5). A well-behaved fork never imported the internals, so:

- **In sync with cella `shared/` (e.g. raak):** you get this by pulling. Zero manual work.
- **Diverged `shared/permissions` (e.g. projectcampus, still on the older `matches`+`sqlForm` design):** this does not apply cleanly — that module is a separate lineage. Port by hand if you want it, or skip it.
- **You referenced any removed symbol** (unusual): `pnpm ts` will point at every site. Use the map below. There is no codemod — the surface is a handful of internal symbols and the compiler finds them all.

## What changed in `shared/` (the mapping)

| Removed | Replacement |
| --- | --- |
| `type RowPredicate` (`{ kind: 'columnEqualsActor' \| 'columnIsNotNull'; column }`) | _gone_ — the name implies the rule |
| `interface RowCondition` (`{ name, predicate }`) | `type RowConditionName = 'own' \| 'public'` |
| `own` (a `RowCondition` object) | the literal `'own'` |
| `publicRow` (a `RowCondition` object, from `public-read.ts`) | the literal `'public'` |
| `rowPredicateMatches(predicate, row, actor)` | `matchesRowCondition(name, row, actor)` |
| `isRowCondition(v)` → `v is RowCondition` | `isRowCondition(v)` → `v is RowConditionName` (now `v === 'own' \|\| v === 'public'`) |
| `NormalizedPermissionValue = 0 \| 1 \| RowCondition` | `0 \| 1 \| RowConditionName` (a cell is the config literal verbatim — nothing to normalize) |

Backend: `compileRowConditionSql(condition: RowCondition, …)` → `compileRowConditionSql(name: RowConditionName, …)`, a name-keyed switch. `ConditionalScope.condition` is now a `RowConditionName`.

`PublicReadMode` / `PublicReadGrants` are unchanged; `public-read.ts` keeps only the grant-keying types. Public read still resolves through the `'public'` row condition, so it rides the same switches and the same parity test as before.

### One type narrowed: `ActionPermissionState`

`boolean | string` → **`boolean | RowConditionName`**. This is what closes a latent gap: the frontend `resolvePermission` used to hard-code `'own'` and silently return `false` for any other name (an owner denied in the UI, no compile error). It is now an exhaustive `switch` over the closed union, so **adding a condition name is a compile error in all three paths** — the engine (`matchesRowCondition`), the SQL compiler (`compileRowConditionSql`), and the frontend (`resolvePermission`) — not just the two shared interpreters. If your fork assigned an arbitrary string into an `ActionPermissionState`, the compiler will flag it; it should have been a condition name or a boolean.

## For forks that referenced the removed symbols

```diff
- import { own, publicRow, rowPredicateMatches, type RowCondition, type RowPredicate } from 'shared';
+ import { matchesRowCondition, type RowConditionName } from 'shared';

- if (isRowCondition(value)) grant(value.name);          // value was a RowCondition object
+ if (isRowCondition(value)) grant(value);               // value IS the name

- rowPredicateMatches(own.predicate, row, actor)
+ matchesRowCondition('own', row, actor)

- rowPredicateMatches(publicRow.predicate, row, actor)
+ matchesRowCondition('public', row, actor)
```

If you had built a custom `RowCondition` in fork code (already unsupported since permission-actor), it will no longer compile. Fold its logic into the shared engine — a considered edit to `RowConditionName` and the three switches — or reconsider whether it belongs in the permission model at all. CDC's `permissionRowKeys` is unchanged (`createdBy` + `publicAt`).

## Gates

```sh
pnpm ts            # compiler finds every affected site; must be clean
pnpm lint          # biome
pnpm exec vitest run shared/src/permissions backend/src/permissions   # incl. the parity property test
```

The parity property test (`backend/src/permissions/row-predicates.test.ts`) is the load-bearing check: it proves the engine, the compiled SQL, `computeCan` + `resolvePermission`, and SSE dispatch still agree row-for-row. It required **no changes** for this refactor — the collapse is behind the same public surface it exercises. To convince yourself the exhaustiveness guarantee is real, temporarily add a third name to `RowConditionName` and confirm `pnpm ts` goes red in all three switches, then remove it.
