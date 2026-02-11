# Frontend diff: `main` vs `contrib/raak`

**Summary**: 647 files changed, 48,508 insertions, 18,822 deletions (152 added, 42 deleted, 66 renamed, 387 modified)

---

## 1. Routing architecture overhaul

### 1.1 Route tree split: `route-tree.base.ts` + `route-tree.tsx`
**Category: Template improvement**

The monolithic `route-tree.tsx` is split into:
- `route-tree.base.ts` — upstream-owned base segments (arrays of routes grouped by layout)
- `route-tree.tsx` — fork composition file that spreads base segments and adds fork routes

Base exports arrays like `basePublicChildren`, `baseAuthChildren`, `baseDocsChildren`, `baseOrganizationChildren`, `baseSystemChildren` that forks spread with `...` and extend inline. This is a clean fork-extension pattern.

**Files**:
- Added: `frontend/src/routes/route-tree.base.ts`
- Modified: `frontend/src/routes/route-tree.tsx`

### 1.2 Router extracted to its own file
**Category: Template improvement**

`frontend/src/lib/router.ts` deleted. Router instance moved to `frontend/src/routes/router.ts` with lifecycle subscriptions (`onBeforeLoad`, `onLoad`) defined inline. Router is now co-located with routing code. The module-level `declare module '@tanstack/react-router'` for `Register` is placed here too.

**Files**:
- Deleted: `frontend/src/lib/router.ts`
- Added: `frontend/src/routes/router.ts`

### 1.3 `StaticDataRouteOption` extended with `boundary`, `isAuth`, `navTab`
**Category: Template improvement**

Each route now declares:
- `boundary?: BoundaryType` ('root' | 'app' | 'public') — used by cleanup hooks
- `isAuth: boolean` — explicit auth requirement
- `navTab?: { id, label }` — tab metadata for automatic `PageTabNav` generation

This enables auto-generated tab navigation from the route tree. New type file: `frontend/src/routes/types.ts`.

### 1.4 `OrganizationLayoutRoute` with `$tenantId/$orgId` params
**Category: Fork-specific** (multi-tenant `tenantId` is Raak-specific)

Route path changed from `/organization/$idOrSlug` to `/$tenantId/$orgId/organization`. Added `OrganizationLayoutRoute` as a parent layout that captures both params, validates tenant access, and fetches org data. Uses `useSuspenseQuery` in child components instead of `useLoaderData`.

**Needs cella adaptation**: The layout route pattern (separating layout from content route) is good architecture, but `$tenantId` is fork-specific. Cella should adopt the layout route wrapping without the tenant param.

### 1.5 `loaderDeps` removed from all routes
**Category: Template improvement**

All `loaderDeps` declarations removed from routes (e.g., `UsersTableRoute`, `OrganizationsTableRoute`). Search params are now handled by the table components themselves rather than at the route level. Reduces coupling between routing and data fetching.

### 1.6 User profile routes simplified
**Category: Template improvement**

`UserProfileRoute` and `UserInOrganizationProfileRoute` deleted from routes. User profiles now opened via sheets (`UserSheetHandler`) triggered by URL search params instead of dedicated routes. Reduces route tree size and uses the overlay pattern consistently.

**Files**:
- Modified: `frontend/src/routes/user-routes.tsx` (66 lines → 16 lines)
- Added: `frontend/src/modules/user/user-sheet-handler.tsx`, `user-sheet.tsx`, `user-profile-content.tsx`

### 1.7 Search params schemas decentralized to modules
**Category: Template improvement**

Centralized `frontend/src/routes/search-params-schemas.ts` deleted. Each module now defines its own search params schema:
- `frontend/src/modules/user/search-params-schemas.ts`
- `frontend/src/modules/organization/search-params-schemas.ts`
- `frontend/src/modules/attachment/search-params-schemas.ts`
- `frontend/src/modules/memberships/search-params-schemas.ts`
- `frontend/src/modules/requests/search-params-schemas.ts`
- `frontend/src/modules/page/search-params-schemas.ts`
- `frontend/src/modules/docs/search-params-schemas.ts`

### 1.8 URL slug rewriting utility
**Category: Template improvement**

New `frontend/src/utils/rewrite-url-to-slug.ts` — called in `beforeLoad` to redirect from ID-based URLs to slug-based URLs transparently (using `replace: true`). Clean pattern for pretty URLs.

### 1.9 Slug-to-ID cache resolution
**Category: Template improvement**

New `frontend/src/query/fetch-slug-cache-id.ts` — fetches entity by slug using a throwaway query key (`gcTime: 0`), then caches result under the entity's ID key. Prevents stale slug-based cache entries.

---

## 2. Realtime/sync architecture (SSE → stream system)

### 2.1 SSE module removed, replaced by stream system
**Category: Template improvement** (architecture), **Needs cella adaptation** (implementation details)

The `modules/common/sse/` directory (3 files: `index.tsx`, `provider.tsx`, `use-sse.tsx`) is deleted. Replaced by a comprehensive stream system in `frontend/src/query/realtime/`:

| File | Purpose |
|------|---------|
| `stream-store.ts` | `StreamManager` class with Zustand store, SSE connection lifecycle, reconnect, circuit breaker |
| `app-stream-handler.ts` | Processes app-scoped SSE notifications (entity CRUD, membership changes) |
| `app-stream.tsx` | React component mounting the app stream |
| `public-stream-handler.ts` | Processes public stream messages |
| `public-stream.tsx` | React component for public stream |
| `tab-coordinator.ts` | Leader election via Web Locks API, BroadcastChannel for cross-tab sync |
| `cache-ops.ts` | Cache invalidation operations |
| `cache-token-store.ts` | Token storage for server-side cache hits |
| `catchup-processor.ts` | Processes missed events on reconnect |
| `membership-ops.ts` | Membership-specific cache operations |
| `sync-priority.ts` | Priority ordering for sync operations |
| `types.ts` | Stream notification types |

Key improvements:
- **Tab coordination**: Only leader tab maintains SSE connection, broadcasts to followers via BroadcastChannel
- **Catchup processing**: On reconnect, fetches missed events since last cursor
- **Circuit breaker**: Prevents reconnect storms
- **Cache token optimization**: SSE notifications include tokens for efficient server-side cache hits

### 2.2 Sync state store
**Category: Template improvement**

New `frontend/src/store/sync.ts` — Zustand store (persisted to localStorage) managing:
- `cursor` — last processed activity ID (for SSE reconnect)
- `activityQueue` — pending notifications
- `isProcessing` — fetch service state
- `lastSyncAt` — timestamp of last sync

### 2.3 `TabCoordinator` component
**Category: Template improvement**

New `frontend/src/modules/common/tab-coordinator.tsx` — mounted in `AppLayout` to initialize multi-tab coordination. Replaces the `SSEProvider` wrapping pattern.

### 2.4 AppLayout simplified
**Category: Template improvement**

`AppLayout` no longer wraps everything in `SSEProvider`. Structure is now flat: `<SidebarWrapper>`, `<TabCoordinator />`, `<AppStream />`, `<Uploader />`, etc. Cleaner component tree.

---

## 3. Query layer restructuring

### 3.1 `query/basic/` — centralized query utilities
**Category: Template improvement**

Previous scattered utilities reorganized into `frontend/src/query/basic/`:

| File | Description |
|------|-------------|
| `create-query-keys.ts` | Factory `createEntityKeys<Filters>('entityType')` for standardized query keys |
| `entity-query-registry.ts` | Central registry — modules register keys, stream handlers look them up dynamically |
| `create-optimistic.ts` | Create optimistic entities from Zod schemas (auto-generates defaults) |
| `find-in-list-cache.ts` | Frame-scoped cache (100ms TTL) for O(1) entity lookup by ID in list queries |
| `infinite-query-options.ts` | `baseInfiniteQueryOptions` — reusable pagination config |
| `invalidation-helpers.ts` | `shouldSkipInvalidation`, `invalidateIfLastMutation` (TkDodo pattern) |
| `helpers.ts` | `changeQueryData`, `changeInfiniteQueryData` cache update helpers |
| `use-mutate-query-data.tsx` | Hook for CRUD cache mutations |
| `use-infinite-query-total.tsx` | Hook for total count from infinite queries |
| `index.ts` | Barrel export |

Previously these were in `query/utils/`, `query/hooks/`, `query/utils/use-mutate-query-data/`, scattered.

### 3.2 `query/offline/` — offline mutation utilities
**Category: Template improvement**

New `frontend/src/query/offline/`:
- `stx-utils.ts` — Transaction metadata (STX) creation for create/update/delete with nanoid IDs
- `squash-utils.ts` — Mutation squashing: cancels pending same-entity mutations, coalesces updates into pending creates
- `detect-changed-fields.ts` — Version-based conflict detection

### 3.3 Mutation registry pattern
**Category: Template improvement**

New `frontend/src/query/mutation-registry.ts`:
- Modules call `addMutationRegistrar()` at load time to register their `mutationFn`
- `initMutationDefaults(queryClient)` is called once at startup in `provider.tsx`
- Enables offline mutation persistence (mutationFn can't be serialized to IndexedDB)

### 3.4 Membership enrichment
**Category: Needs cella adaptation**

New `frontend/src/query/membership-enrichment.ts` — auto-enriches context entity list queries with membership data from the `me/memberships` cache. Uses `queryClient.getQueryCache().subscribe()` to intercept query results and attach `membership` objects. Prevents N+1 membership fetches.

The concept is valuable but the implementation references workspace/project entity types that are Raak-specific.

### 3.5 Persister improvements
**Category: Template improvement**

- Session-scoped persister (`session-<uuid>` key) for non-offline mode — survives refresh, cleaned on tab close
- Orphaned session cleanup (24h TTL)
- Error handling with Sentry
- App-specific DB name (`${appConfig.slug}-query-persister`)
- `beforeunload` cleanup handler
- Only leader tab persists mutations (prevents cross-tab conflicts)

### 3.6 Query client improvements
**Category: Template improvement**

- Default stale time: 30s (was 1min)
- `updateStaleTime()` — switches to infinite when offline
- `silentRevalidateOnReconnect()` — invalidates active queries on reconnect
- Mutations: `networkMode: 'offlineFirst'`

### 3.7 Provider improvements
**Category: Template improvement**

- Session vs IDB persister selection based on `offlineAccess`
- Tab coordinator integration (only leader persists)
- Downloads/uploads services started at module level
- `initMutationDefaults()` called before cache restoration
- Uses `ensureInfiniteQueryData` for infinite queries in prefetch
- `revalidateIfStale` removed from `ensureQueryData` calls (relies on staleTime)

### 3.8 Deleted files
**Category: Template improvement**

- `query/offline-manager.ts` — replaced by store + stream system
- `query/utils/infinite-query-options.ts` — moved to `query/basic/`
- `query/utils/prefetch-query.ts` — replaced by direct `queryClient.ensureQueryData`
- `query/utils/use-find-in-query-cache.ts` — replaced by `query/basic/find-in-list-cache.ts`
- `query/README.md` — removed stale docs
- `hooks/use-mutations.tsx` — trivial wrapper removed, direct `useMutation` import used

---

## 4. Module structure changes

### 4.1 Plurals → singulars rename
**Category: Template improvement**

All entity modules renamed from plural to singular:
- `modules/users/` → `modules/user/`
- `modules/organizations/` → `modules/organization/`
- `modules/pages/` → `modules/page/`
- `modules/attachments/` → `modules/attachment/`

Table files renamed: `table/index.tsx` → `table/{entity}-table.tsx` (explicit naming).

### 4.2 Module query patterns standardized
**Category: Template improvement**

Each module now follows a consistent pattern in its `query.ts`:
```typescript
const keys = createEntityKeys<Filters>('entityType');
registerEntityQueryKeys('entityType', keys);
export const entityQueryKeys = keys;

export const findInListCache = (id) => findInListCache<Entity>(keys.list.base, ...);
export const entityQueryOptions = (id) => queryOptions({ queryKey: keys.detail.byId(id), ... });
export const entitiesListQueryOptions = (params) => infiniteQueryOptions({ ...baseInfiniteQueryOptions });

export const useEntityCreateMutation = () => useMutation({ mutationKey: keys.create, ... });
export const useEntityUpdateMutation = () => useMutation({ mutationKey: keys.update, ... });
export const useEntityDeleteMutation = () => useMutation({ mutationKey: keys.delete, ... });
```

Uses `invalidateIfLastMutation` in `onSettled` to prevent over-invalidation.

### 4.3 Electric SQL / TanStack DB removed
**Category: Template improvement**

Dependencies removed:
- `@electric-sql/client`
- `@tanstack/electric-db-collection`
- `@tanstack/offline-transactions`
- `@tanstack/react-db`

Files deleted:
- `frontend/src/utils/electric-utils.ts`
- `frontend/src/modules/attachments/collections.ts`
- `frontend/src/modules/pages/collections.ts`
- `frontend/src/modules/attachments/offline/` (executor, index, use-offline-attachments)

Replaced by: Standard React Query with offline mutation support via mutation registry + squash utils.

### 4.4 Tenants module (new)
**Category: Fork-specific**

New `frontend/src/modules/tenants/` with full CRUD:
- `create-tenant-form.tsx`
- `query.ts`
- `search-params-schema.ts`
- `table/tenants-bar.tsx`, `tenants-columns.tsx`, `tenants-table.tsx`

Added `TenantsTableRoute` in system routes. Multi-tenant management is Raak-specific.

### 4.5 Attachment module improvements
**Category: Template improvement (partial), Fork-specific (partial)**

- `download-service.ts`, `upload-service.ts` — background blob caching and upload sync
- `hooks/use-attachment-url.ts`, `use-blob-sync-status.ts`, `use-resolved-attachments.ts`
- `table/sync-status-cell.tsx` — shows blob sync status in table
- Offline mutation support with STX metadata

The download/upload service pattern and blob caching are good template-level improvements. The sync status cell is fork-specific.

---

## 5. Navigation/UI changes

### 5.1 `PageNav` → `PageTabNav` with auto-generation
**Category: Template improvement**

`modules/common/page/nav.tsx` deleted, replaced by `modules/common/page/tab-nav.tsx`:
- New prop: `parentRouteId` — auto-generates tabs from child routes with `staticData.navTab`
- New hook: `hooks/use-nav-tabs.ts` — extracts tabs from route tree dynamically
- Can still accept explicit `tabs` array
- Added `filterTabIds` prop for permission-based tab filtering

### 5.2 Settings sheet extracted from menu
**Category: Template improvement**

New `frontend/src/modules/navigation/settings-sheet.tsx` — settings (keep menu open, detailed menu, offline access) extracted from menu sheet into a dedicated settings sheet. Added to `navItems` in `nav-config.tsx`.

### 5.3 `useBoundaryCleanup` hook
**Category: Template improvement**

New `frontend/src/hooks/use-boundary-cleanup.ts` — closes overlays when:
- Crossing mobile/desktop breakpoint
- Switching between `app` and `public` boundary types

Used by `Sheeter` and `Dialoger` providers. Replaces ad-hoc resize/route watching.

### 5.4 `useUrlOverlayState` hook
**Category: Template improvement**

New `frontend/src/hooks/use-url-overlay-state.tsx` — manages URL search param-based overlays (sheets, dialogs). Handles:
- Open/close state from search param presence
- Trigger ref management for focus restoration
- `history.back()` when trigger exists, `navigate` with param removal otherwise
- Prevents double-close races

### 5.5 UI lock system
**Category: Template improvement**

`useUIStore` gains `uiLocks: string[]` with `lockUI(source)` / `unlockUI(source)`. Sheeter uses it to signal when sheets are open. Can be used to prevent conflicting UI interactions.

### 5.6 `CloseButton` component
**Category: Template improvement**

New `frontend/src/modules/common/close-button.tsx` — reusable close/dismiss button with size variants (sm/md/lg).

---

## 6. Data grid (new)

### 6.1 Custom data grid component
**Category: Template improvement**

New `frontend/src/modules/common/data-grid/` — 58 files, 7,274 lines. A complete custom data grid implementation replacing react-data-grid dependency (or heavily customizing it):

Key files: `data-grid.tsx`, `tree-data-grid.tsx`, `types.ts`, `index.ts`

Hooks: `use-calculated-columns`, `use-column-widths`, `use-copy-paste`, `use-current-breakpoint`, `use-expandable-rows`, `use-grid-dimensions`, `use-responsive-columns`, `use-roving-tab-index`, `use-row-selection`, `use-viewport-columns`, `use-viewport-rows`

Utils: `breakpoint-utils`, `cell-range-utils`, `clipboard-utils`, `col-span-utils`, `dom-utils`, `event-utils`, `keyboard-utils`, `selected-cell-utils`, `style-utils`

Cell renderers: `render-checkbox`, `render-toggle-group`, `render-value`, `select-cell-formatter`

Features: mobile sub-rows, responsive columns, copy-paste, sort status, grouped headers, expandable rows, summary rows.

---

## 7. Export pattern changes

### 7.1 Default exports → named exports
**Category: Template improvement**

Systematic conversion across the codebase:
- `export default ErrorNotice` → `export function ErrorNotice`
- `export default Spinner` → `export { Spinner }`
- `const X = () => {}; export default X` → `function X() {}` (function declarations)
- Arrow function assignments → function declarations throughout

This improves tree-shaking, refactoring safety, and import consistency.

### 7.2 `console.log` → `console.info` in test mocks
**Category: Template improvement**

`vitest.setup.ts` and `.storybook/vitest.setup.ts` now mock `console.info` instead of `console.log`. Allows `console.log` debugging during tests while suppressing info-level noise.

---

## 8. Dependency changes

### 8.1 Removed
- `@electric-sql/client` — sync engine replacement
- `@tanstack/electric-db-collection` — sync engine replacement
- `@tanstack/offline-transactions` — sync engine replacement
- `@tanstack/react-db` — sync engine replacement
- `@github/mini-throttle` — unused

### 8.2 TypeScript tooling
**Category: Template improvement**

`tsgo` is now the default `ts` script (was `tsc`). Old `tsc` variants renamed to `:old`. Reflects TypeScript Go compiler adoption.

### 8.3 Version bumps
- TanStack Router: `^1.150.0` → `^1.159.5`
- TanStack Query: `^5.90.17` → `^5.90.20`
- Sentry: `^10.34.0` → `^10.38.0`
- Storybook: `^10.1.11` → `^10.2.8`
- Various minor bumps for Uppy, BlockNote, Floating UI, etc.

### 8.4 New script
**Category: Template improvement**

`fix-exports` script added (`frontend/scripts/fix-exports.ts`) with `--dry-run` option.

---

## 9. Debug/development tooling

### 9.1 Debug dropdown
**Category: Template improvement**

New `frontend/src/modules/common/debug-dropdown.tsx` — dropdown menu for dev tools (Drizzle Studio, docs, Storybook, TanStack Router/Query devtools, react-scan, sync devtools).

### 9.2 Sync devtools
**Category: Template improvement**

New `frontend/src/modules/common/devtools/sync-devtools.tsx` — debugging panel for stream state, tab coordination, sync cursor, and span traces.

### 9.3 Tracing module
**Category: Template improvement**

New `frontend/src/lib/tracing.ts` — lightweight frontend tracing with span store, wrapping a shared tracing module from `shared/tracing`. Spans are stored in memory and accessible via sync devtools.

---

## 10. Miscellaneous

### 10.1 `config` → `shared` import path
**Category: Template improvement** (reflects monorepo package rename)

All `import { appConfig } from 'config'` → `import { appConfig } from 'shared'`.

### 10.2 `level` → `boundary` prop rename in `ErrorNotice`
**Category: Template improvement**

`ErrorNotice` prop `level` renamed to `boundary` with typed `BoundaryType`. Clearer semantics.

### 10.3 `useMounted` → `useMountedState` rename
**Category: Template improvement**

Hook renamed from `use-mounted` to `use-mounted-state` (explicit about being state, not effect).

---

## Summary table

| Category | Count | Key areas |
|----------|-------|-----------|
| **Template improvement** | ~35 | Route tree split, router extraction, navTab auto-generation, query/basic utilities, module rename, export patterns, SSE→streams architecture, persister improvements, data grid, debug tools |
| **Fork-specific** | ~5 | Tenants module, `$tenantId` route param, workspace/project entity types in enrichment |
| **Needs cella adaptation** | ~3 | OrganizationLayoutRoute pattern (without tenant), membership enrichment (without workspace/project), sync status UX |

### High-priority recommendations for cella main

1. **Route tree split** (`route-tree.base.ts` + `route-tree.tsx`) — cleanest fork pattern
2. **Router extraction** to `routes/router.ts`
3. **`query/basic/` utilities** — `createEntityKeys`, `entityQueryRegistry`, `baseInfiniteQueryOptions`, `invalidation-helpers`, `find-in-list-cache`
4. **Module rename** plural → singular
5. **Search params schemas** decentralized to modules
6. **Export pattern** default → named + arrow → function declarations
7. **Mutation registry** for offline persistence
8. **NavTab auto-generation** from route `staticData`
9. **`useBoundaryCleanup`** and `useUrlOverlayState` hooks
10. **`config` → `shared`** import path migration
