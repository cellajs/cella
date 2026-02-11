# contrib/raak adoption plan

Analysis of the `contrib/raak` branch (commit `2cc5888d4`) which sits one commit on top of `development`. That commit contains 72 drifted files from the raak fork.

> **Note**: The `development` branch already shares 159 commits with `contrib/raak`. This plan only covers the 72 files in the final "drifted files" commit — the rest is already in our tree.

## Context

- `contrib/raak` = `development` + 1 commit (72 drifted files, +603/-385 lines)
- `main` is 15 commits behind `development` (merge-base: `6de1d589d`)
- Raak adds entities: `workspace`, `project`, `task`, `label` plus a `guest` role
- Several changes mix generic fixes with raak-specific columns — those need splitting

---

## 1. ADOPT — Apply directly to cella (~44 files)

These are bug fixes, type safety improvements, and generic enhancements.

### HIGH priority

| # | File(s) | What | Why |
|---|---------|------|-----|
| A1 | `backend/src/db/utils/generate-context-entity-columns.ts` | Mapped type `ContextEntityIdColumns<T>`, function overloads for `'all'` vs `'relatable'` | Major type-safety improvement — gives compile-time knowledge of column keys instead of `Record<string, ...>` |
| A2 | `me-handlers`, `user-handlers`, `system-handlers` (3 files) | Re-select with `userSelect` to include `lastSeenAt` in responses | Bug — `lastSeenAt` is missing from all user-returning endpoints |
| A3 | `me-handlers`, `memberships-handlers`, `permission-manager/check.ts`, `validation.ts` | `EntityIdColumnNames` / `InactiveEntityIdColumnNames` type cast helpers for dynamic column access | Fixes real TS compile errors when accessing dynamic FK columns |
| A4 | `page-handlers.ts` | `rejectedItems` → `rejectedItemIds` | Bug — field name mismatch with schema |
| A5 | `me-schema.ts` | `uploadTokenSchema` allows `null` for `signature` and `params` | Bug — some upload providers return null |
| A6 | `permission-manager/types.ts` | `ContextEntityIdColumns` values from `string` to `string \| null` | Bug — nullable FK columns must be reflected in types |
| A7 | `select-emails.tsx` | Internal `useState` to fix React setState-during-render | Bug — Controller render-loop error reproducible in cella |
| A8 | `entities-handlers.ts` | `as any` cast on `streamSSE` return (2 places) | Bug — `streamSSE` returns `Response`, not `TypedResponse` |
| A9 | `memberships-handlers.ts` | Use `ctx.var.tenantId` instead of `entity.tenantId` | Bug — entity may not always carry tenantId |

### MEDIUM priority

| # | File(s) | What | Why |
|---|---------|------|-----|
| A10 | `mock-membership.ts` | Dynamic null-init from `appConfig.contextEntityTypes` | More robust — adapts to whatever entity types an app defines |
| A11 | `metrics-routes.ts` | Add mock examples to all 5 metrics route OpenAPI responses | Improves API docs |
| A12 | `organization-handlers.ts` | Throw error when membership missing; add `tenantId` to response | Better error handling; data consistency |
| A13 | `system-routes.ts`, `user-routes.ts` | Role schema: `.optional()` → `z.union([..., z.null()]).optional()` | Schema should match reality (null vs undefined) |
| A14 | `error-response-schemas.ts` | Improved JSDoc + better `as unknown as` cast | Documents known `@hono/zod-openapi` `$ref` limitation |
| A15 | `get-member-counts.ts` | `InactiveEntityIdColumnNames` type + `getInactiveEntityIdColumn()` | Type-safe column access for invite count subquery |
| A16 | `header.tsx`, `app-search.tsx`, `menu-sheet/item.tsx`, `tile.tsx` | `getContextEntityRoute` → `getEntityRoute` | Name fix — works for all entity types |
| A17 | `tile.tsx` | Avatar `type` from hardcoded `"organization"` to `entity.entityType` | Bug — wrong avatar type for non-org entities |
| A18 | `operation-examples.tsx`, `parse-spec.ts` | Filter to only show 2xx responses in OpenAPI examples | Bug — error `$ref` responses shouldn't show as examples |
| A19 | `entity-guards.ts`, `index.ts`, `types.ts` | Add `isRealtimeEntity()`, `OfflineEntityType`, `RealtimeEntityType` | Generic infrastructure types derived from appConfig |

### LOW priority

| # | File(s) | What | Why |
|---|---------|------|-----|
| A20 | `scripts-config.ts` | TODO-010 comment about CLI migration paths | Valid reminder |
| A21 | `auth-layout`, `app-footer`, `app-layout`, `docs-sidebar`, `marketing/*`, `menu-sheet/header`, `app-nav-loader`, `home-routes.tsx` (8 files) | `{ Logo }` / `{ Home }` / `{ AppSheets }` → default imports | Must match actual exports |
| A22 | `custom-block-type-change.tsx`, `reset-block-type.tsx`, `operations-page.tsx`, `overview-table.tsx` | Remove `useMemo` calls | React Compiler convention |
| A23 | `blocknote/helpers/index.ts` | Add `copyBlocksToClipboard()` utility | Generic BlockNote clipboard helper |
| A24 | `common.json` | Add `copy_as_link`, `copy_content` translation keys | Generic UI translations |
| A25 | `privacy-text.tsx` | Simplify text (remove subtasks reference) | Cella doesn't have subtasks |
| A26 | `organization-page.tsx`, `organizations-bar.tsx`, `update-organization-form.tsx` | TODO comments | Valid architectural notes |
| A27 | `backend/tsconfig.json` | Formatting cleanup | Trivial |
| A28 | `pnpm-workspace.yaml` | Trailing newline | POSIX compliance |
| A29 | `query/provider.tsx`, `menu-sheet/helpers/get-menu-data.ts` | `as any` casts for heterogeneous query options | Fixes type errors |
| A30 | `parse-spec.test.ts.snap` | Snapshot update | Must regenerate after applying relevant changes |
| A31 | `env.ts` | Add `VITE_DEBUG_UI` env var | Generic debug toggle |

---

## 2. ADAPT — Cella needs its own fix (~18 files)

These changes reveal real template limitations but the raak solution includes fork-specific entity columns.

### HIGH priority

| # | File(s) | Issue | Raak's approach | Cella's approach |
|---|---------|-------|-----------------|------------------|
| B1 | `memberships.ts`, `inactive-memberships.ts` | Unique constraint only covers `organizationId` — breaks when forks add entities | Constraint includes `contextType` + all entity ID columns + `.nullsNotDistinct()` | Add `contextType` to constraint. Make the entity ID columns part of a generated composite — possibly through a helper that reads `appConfig.contextEntityTypes` |
| B2 | `membership-enrichment.ts` | Enrichment hardcoded to `organizationId` | Adds `workspace`/`project` to enrichable types with composite key matching | Make enrichment dynamic using `appConfig.entityIdColumnKeys` lookup |
| B3 | `query-mutations.ts`, `organizations-table.tsx` | `useChangeEntityRoleMutation` didn't handle multi-entity properly | Inlined mutation logic with offline checks and direct cache updates | Fix the hook to be truly generic; don't inline |

### MEDIUM priority

| # | File(s) | Issue | Cella's approach |
|---|---------|-------|------------------|
| B4 | `permission-manager/check.perf.test.ts`, `index.test.ts`, `cdc-event-bus.test.ts` | Tests hardcode membership shape — drift when forks add columns | Generate test membership shapes from `appConfig` dynamically |
| B5 | `select-combobox/parent.tsx` | `as any` on `queryFactory` due to heterogeneous context entity query types | Improve `getContextEntityTypeToListQueries()` return type |
| B6 | `invitations-columns.tsx`, `me/query.ts` | Invitation mutation moved inline to avoid circular deps | Decide canonical location — separate mutations file or keep in query.ts |
| B7 | `floating-nav.tsx`, `route-tree.base.ts` | `floatingNavButtons` changed from `{ left, right }` to flat array | Evaluate if the simpler API is better or if explicit left/right is more flexible |
| B8 | `sidebar-nav.tsx` | Casts `type` to `string` for footer filter | Add `'footer'` to nav item type union, or handle it in the filter differently |

---

## 3. IGNORE — Fork-specific (~5 files)

Keep in raak only; no action needed in cella.

| # | File(s) | Why |
|---|---------|-----|
| C1 | `.gitignore` | Removes `.trigger` — Trigger.dev is raak-only |
| C2 | `backend/src/db/schema/index.ts` | Exports `labels`, `projects`, `tasks`, `workspaces`, `repositories-installation` — raak entities |
| C3 | `shared/hierarchy-config.ts` | Raak's entity hierarchy (workspace, project, task, label, guest role) |
| C4 | `shared/src/builder/types.ts` | Optional `zipBucket` in S3Config — raak feature |
| C5 | `me-handlers.ts` (sub-item) | `workspaceId`/`projectId` in membership response — raak columns |
| C6 | `organization-handlers.ts` (sub-item) | `workspaceId`/`projectId` in membership responses — raak columns |

---

## Execution plan

### Phase 1: Bug fixes (HIGH ADOPT items)
Apply A1–A9 directly. These are bugs or type errors that affect cella today.

### Phase 2: Adapt membership infrastructure (HIGH ADAPT items)
Implement B1–B3 with cella-appropriate solutions:
- Membership unique constraints with `contextType`
- Dynamic enrichment
- Fix `useChangeEntityRoleMutation`

### Phase 3: Medium priority items
Apply A10–A19 and implement B4–B8.

### Phase 4: Low priority cleanup
Apply A20–A31 (import fixes, useMemo removal, TODOs, translations).

---

## Split commits needed

Some files contain both ADOPT and IGNORE changes:
- `me-handlers.ts` — adopt type casts + `lastSeenAt` fix, ignore `workspaceId`/`projectId`
- `organization-handlers.ts` — adopt error throw + `tenantId`, ignore raak columns
- `backend/src/db/schema/index.ts` — ignore entirely (raak exports)
- `shared/hierarchy-config.ts` — ignore entirely (raak hierarchy)

For these, cherry-pick only the adoptable hunks.
