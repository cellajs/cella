# Permissions engine: row-level design

Background on three subject-level mechanisms that sit alongside role×context access
policies: public read grants, row conditions, and row restrictions.

## Public read grants (`public-read.ts`)

Subject-level grants that make rows readable by any actor, including anonymous, based on
row data, independent of memberships.

- `publicSelf`: readable when the row's own `publicAt` timestamp is set.
- `publicParent`: readable when the parent context row's `publicAt` is set.
- `publicParentOrSelf`: either of the above.

Declared per subject in the permissions config (`configurePermissions` → `publicRead(mode)`),
evaluated by the permission engine for the `read` action, and attributed as
`grantedBy: { type: 'public', mode }`.

`publicParent` reads another row's field. Per the cross-row design (load-at-check, resolved
once per request/event), the caller resolves the parent row and passes it as
`subject.parentRow`; the engine never loads rows itself. A subject without `row` or
`parentRow` never matches: paths that don't resolve row data (e.g. stream dispatch today)
are unaffected.

## Row conditions (`row-conditions.ts`)

Per-row qualifications on access-policy grants. A policy cell value of `1` grants an action
on every row the context scope reaches; a `RowCondition` cell value grants the action only
on rows that satisfy the condition (e.g. rows the actor created). Conditions are declared
once and consumed by every enforcement path:

- **check-form** (`matches`): evaluated by the permission engine per subject, and by the
  frontend to resolve conditional `can` states per row.
- **SQL-form** (`sqlForm`): a declarative descriptor (this package is ORM-free) that the
  backend compiles into a row predicate for collection reads and other set-based paths.
  Keeping it declarative, instead of a SQL-building function, makes the check-form/SQL-form
  parity property testable and the descriptor safe to evaluate in shared code.

The `'own'` policy literal is sugar for the built-in `own` condition and is normalized away
when policies are configured; the engine and downstream consumers only ever see
`0 | 1 | RowCondition`.

## Row restrictions (`row-restrictions.ts`)

Subject-level rules that narrow membership grants per row. Where grants (policy cells, row
conditions, public read) only ever widen access, a restriction shrinks a row's audience
within the members who would otherwise see it:

- `visibilityDepth`: the row column names the least specific context level whose members may
  act on the row. A membership grant qualifies only if it was granted by a context at least
  as specific as the row's depth. Example (chain `project > organization`): a row with depth
  `'project'` is invisible to grants from the organization level; a row with depth
  `'organization'` is visible to grants from both levels. `null` means no depth restriction.
- `audienceRoles`: the row column holds the roles allowed to act on the row; a grant
  qualifies only if its role is in the set. Roles qualify per grant at the grant's own level,
  so one set can span levels (e.g. course `staff` ∪ project `owner`). `null` or `[]` means no
  role restriction.
- `exemptRoles`: grants with these roles bypass the restriction entirely. Without an
  exemption, a depth restriction would lock org admins out of restricted rows, so the
  exemption must be explicit and declared.

Semantics:

- Restrictions narrow membership grants only. Row-condition grants (e.g. `'own'`, a creator
  always sees their own row) and public read grants are not narrowed.
- `create` is never restricted: there is no row yet to restrict on.
- Fail closed: if a restriction is declared for an entity type but the subject carries no
  `row` data, non-exempt membership grants do not qualify. Every enforcement path for a
  restricted entity must resolve row data (or rely on exempt roles).
- No time-based rules: lifecycle changes (e.g. widening a submission after a deadline) are
  API-level column rewrites, not engine concepts.
