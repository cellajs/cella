# Permissions engine: row-level design

Background on the two subject-level mechanisms that sit alongside role×context access
policies: public read grants and row conditions.

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

Both mechanisms only ever WIDEN access relative to the role×context policy matrix, and both
derive from the row's own columns (`publicAt`, `createdBy`). There is deliberately no per-row
narrowing mechanism: visibility variance belongs at the type level (give the entity its own
policy matrix), so read visibility stays a function of the context chain, memberships × the
static policy matrix, and the row's own data.
