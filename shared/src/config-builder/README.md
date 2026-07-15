# shared/src/config-builder

## Entity hierarchy

Each product entity has exactly one home context: its declared `parent`. The home is where a
row physically lives, becomes a non-null `<context>Id` column (see `channelRelationColumns`),
and is the most-specific link in the entity's ancestor chain used for permissions and
public-read inheritance. A product can never have more than one home; `parent` is required,
since without a home there is no context to derive access from.

- `relatedChannels` declares non-ancestor context references (nullable id columns): cross-links,
  not homes.
- `nullableAncestors` declares ancestors whose id columns are nullable: rows may attach above the
  declared parent (variable-depth rows, e.g. a course-stream item with `projectId = null`). The
  chain root stays non-null, so a row always belongs to the root context. CDC attributes each row
  to its deepest non-null ancestor (see `resolveDeepestAncestorId`).

Public readability is a permission concern, declared per subject via `publicRead(mode)` in
`shared/src/permissions/public-read.ts`, not in the hierarchy.

**Fork contract**: every tenant-scoped table must have `tenant_id`. Tables with an organization
parent must also have `organization_id` with a composite FK to `organizations(tenant_id, id)`.
Covered by `backend/tests/integration/schema-verification.test.ts`.

## Row-to-context attribution

Which context "owns" a row: walk the strict ancestor chain most-specific-first and take the
first non-null ancestor id. With nullable ancestors, rows may attach above their declared
parent; the deepest non-null ancestor is then the row's effective home. Without nullable
ancestors this is just the declared parent.

Every site that answers "which context owns this row" shares this rule: CDC seq scoping and
counter deltas, wire-notification `channelId`, seen-by grouping, and counter recalculation.
See `resolve-row-channel.ts`, covered by `shared/src/config-builder/tests/resolve-row-channel.test.ts`.
