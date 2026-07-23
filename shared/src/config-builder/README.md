# shared/src/config-builder

## Entity hierarchy

Each product entity has exactly one home channel: its declared `parent`. The home is where a row physically lives, becomes a non-null `<channel>Id` column (see `channelRelationColumns`), and is the most-specific link in the entity's ancestor chain used for permissions and public-read inheritance. A product can never have more than one home; `parent` is required, since without a home there is no channel to derive access from.

- `relatedChannels` declares non-ancestor channel references (nullable id columns): cross-links, not homes.
- `nullableAncestors` declares ancestors whose id columns are nullable: rows may attach above the declared parent (variable-depth rows, e.g. a course-stream item with `projectId = null`). The chain root stays non-null, so a row always belongs to the root channel. CDC attributes each row to its deepest non-null ancestor (see `resolveDeepestAncestorId`).

Public readability is a permission concern, declared per subject via `publicRead(mode)` in `shared/src/permissions/public-read.ts`, not in the hierarchy.

**Fork contract**: every tenant-scoped table must have `tenant_id`. Tables with an organization parent must also have `organization_id` with a composite FK to `organizations(tenant_id, id)`. Covered by `backend/tests/integration/schema-verification.test.ts`.

## Row-to-channel attribution

Which channel "owns" a row: walk the strict ancestor chain most-specific-first and take the first non-null ancestor id. With nullable ancestors, rows may attach above their declared parent; the deepest non-null ancestor is then the row's effective home. Without nullable ancestors this is just the declared parent. The rule is exposed as `EntityHierarchy` instance methods (`hierarchy.resolveDeepestAncestorId`, `hierarchy.computeProductPath`, ...); `resolve-row-channel.ts` and `row-path.ts` hold the implementations over the internal `AncestorSource` seam.

Every site that answers "which channel is this row's home" shares this rule: CDC counter deltas and self-summary placement (`e:f:h:`/`e:c:h:`, `e:li:h:`/`e:lu:h:`), wire-notification `channelId`, seen-by grouping, and counter recalculation. (The org SEQUENCE does not key on it — seq values are org-scoped.) The id-path (`row-path.ts`) is the same rule in path form: its last segment equals the deepest non-null ancestor, asserted by tests. Channel tables store it as a generated column (mirrored to `channel_counters.path` for catchup ancestry); product rows compute it where needed. Covered by `shared/src/config-builder/tests/`.
