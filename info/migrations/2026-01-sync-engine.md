# Migration Plan: Fork Repositories - January 2026

This migration plan covers the sync engine implementation changes in Cella that require manual migration for fork repositories (like Raak) after running `pnpm sync`.

## Upstream Reference
- **Date**: January 23, 2026
- **Branch**: development
- **Summary**: Hybrid sync engine implementation with SSE streaming, offline support, and multi-tab coordination

---

## Fork Configuration Context

Before migrating, identify your fork's `cella.config.ts` settings. The following files are commonly ignored/pinned by forks:

```typescript
// Example from raak's cella.config.ts
overrides: {
  ignored: [
    "info/*",                    // Documentation (includes new sync docs)
    "cli/create-cella/*",
    "backend/drizzle/*",         // Migrations
    "frontend/src/api.gen/*",    // Generated API client
  ],
  pinned: [
    "config/default.ts",         // App identity & entity model ⚠️ MIGRATION REQUIRED
    "config/development.ts",     // ⚠️ Check for new properties
    "package.json",              // ⚠️ Check new scripts/deps
    "render.yaml",               // Deployment config
    // ... and many others
  ]
}
```

---

## High Priority Changes (Breaking/Required)

### 1. Config Entity Type Arrays

**Upstream file**: `config/default.ts`
**What changed**: Added new entity type categories for sync engine

Upstream added:
```typescript
offlineEntityTypes: [] as const,           // NEW: Entities with offline queue
realtimeEntityTypes: ['attachment', 'page'] as const,  // NEW: Entities with live stream
```

**Migration steps**:
1. Add these two properties to your fork's `config/default.ts`
2. Determine which of YOUR entities should support realtime sync
3. Determine which should have offline-only transactions (usually empty to start)

**Fork adaptation example** (for raak with `task` entity):
```typescript
// In config/default.ts, add after productEntityTypes:
offlineEntityTypes: [] as const,
realtimeEntityTypes: ['task'] as const,  // Replace with your synced entities
```

### 2. New Sync-Related Stores Integration

**Upstream files**: `frontend/src/utils/flush-stores.ts`
**What changed**: Added sync store cleanup on logout

```typescript
// NEW imports needed:
import { clearAllFieldTransactions } from '~/query/offline';
import { clearAllOffsets } from '~/query/realtime';

// In flushStores():
clearAllFieldTransactions();
clearAllOffsets();
```

**Migration steps**:
1. Review your fork's `flush-stores.ts` if pinned
2. Add the new sync-related cleanup calls
3. Ensure imports work (files will be synced from upstream)

### 3. Package.json Changes

**Upstream file**: `package.json`
**What changed**: New dev scripts and test mode structure

```json
{
  "scripts": {
    "dev": "pnpm clean && cross-env DEV_MODE=full pnpm -r --parallel --stream dev",
    "dev:core": "pnpm clean && cross-env DEV_MODE=core pnpm -r --parallel --stream dev"
  }
}
```

**Migration steps**:
1. Add `dev:core` script if you want PostgreSQL-only dev mode
2. Update `dev` script to include `DEV_MODE=full` if using CDC Worker
3. Verify `cross-env` is in devDependencies

### 4. New Error Translation Keys

**Upstream file**: `locales/en/error.json`
**What changed**: Added conflict detection error messages

```json
{
  "field_conflict": "Field conflict",
  "field_conflict.text": "This field was modified by another user. Please refresh and try again."
}
```

**Migration steps**:
1. Add these keys to your fork's translation files
2. Translate to other supported languages if applicable

---

## Medium Priority Changes (Recommended)

### 5. Info Documentation Updates

**Upstream files**: `info/AGENTS.md`, `info/TESTING.md`, `info/ARCHITECTURE.md`
**What changed**: Updated tech stack references, new test modes documentation

Key changes in `info/AGENTS.md`:
- Removed "Electric Sync" references from tech stack
- Updated dev commands: `pnpm dev` now sets `DEV_MODE=full`, new `pnpm dev:core`
- Updated coding style: camelCase for constants (no UPPER_CASE)

**Migration steps** (if fork maintains its own docs):
1. Update tech stack to reflect sync engine changes
2. Document new test modes (basic/core/full) if using
3. Update dev command references

### 6. New Sync Engine Documentation

**New upstream files** (in `info/`):
- `SYNC_ENGINE_REQUIREMENTS.md` - Detailed requirements spec
- `SYNC_ENGINE_TODO.md` - Implementation progress
- `SYNC_ENGINE_PERF_TESTING.md` - Performance testing plan
- `STREAM_REFACTOR_PLAN.md` - Stream infrastructure docs
- `HYBRID_SYNC_ENGINE_PLAN.md` - Architecture plan

**Migration steps**:
1. If your fork ignores `info/*`, these won't sync automatically
2. Consider copying these for reference if implementing sync features
3. Review for patterns applicable to your fork's entities

### 7. Render.yaml Cleanup

**Upstream file**: `render.yaml`
**What changed**: Removed Electric API secret (no longer using Electric Sync)

```yaml
# Removed:
- key: ELECTRIC_API_SECRET
  sync: false
```

**Migration steps**:
1. Remove `ELECTRIC_API_SECRET` from your deployment config if present
2. Update any Electric-related environment variables

---

## Low Priority Changes (Optional/Informational)

### 8. Backend Dependencies

**Upstream file**: `backend/package.json`
**What changed**: Added WebSocket, OpenTelemetry enhancements

New dependencies:
- `ws: ^8.18.0` - WebSocket for CDC Worker communication
- `@hono/otel: ^1.1.0` - OpenTelemetry instrumentation
- `@opentelemetry/instrumentation-runtime-node`
- `@opentelemetry/sdk-metrics`

New devDependencies:
- `@types/ws: ^8.18.0`

**Migration steps**:
1. If fork's `backend/package.json` is pinned, add these dependencies
2. Run `pnpm install` after updating

### 9. CDC Package Updates

**Upstream file**: `cdc/package.json`
**What changed**: Added WebSocket client and Zod for validation

New dependencies:
- `ws: ^8.18.0`
- `zod: ^3.24.0`
- `@types/ws: ^8.18.0` (dev)
- `wait-on: ^8.0.3` (dev)

**Migration steps**:
1. Add dependencies if fork uses CDC Worker
2. If not using CDC, these changes can be ignored

---

## Files Auto-Synced (No Action Needed)

These files should sync automatically unless pinned:

### Frontend Sync Primitives (New)
- `frontend/src/query/realtime/index.ts`
- `frontend/src/query/realtime/offset-store.ts`
- `frontend/src/query/realtime/stream-types.ts`
- `frontend/src/query/realtime/sync-coordinator.ts`
- `frontend/src/query/realtime/tab-coordinator.ts`
- `frontend/src/query/realtime/use-live-stream.ts`

### Deleted Files
- `frontend/src/query/utils/use-find-in-query-cache.ts` (removed)
- `frontend/src/utils/electric-utils.ts` (removed - Electric Sync no longer used)

---

## Files Intentionally Different (No Migration Needed)

These are typically pinned by forks and intentionally customized:

- `README.md` - Fork's own documentation
- `frontend/public/static/*` - Fork's branding/assets
- `frontend/src/routes/*` - Fork's route structure
- `backend/src/routes.ts` - Fork's API routes
- `backend/scripts/seeds/*` - Fork's seed data

---

## Post-Migration Checklist

After applying migrations:

- [ ] Run `pnpm install` to install new dependencies
- [ ] Run `pnpm generate:openapi` to regenerate API types
- [ ] Run `pnpm check` to validate TypeScript and linting
- [ ] Run `pnpm test:basic` for quick validation
- [ ] Test sync features manually if implementing
- [ ] Update `.env` files if new environment variables needed
- [ ] Review CDC Worker setup if using realtime sync

---

## Entity Model Mapping

When migrating, map Cella's default entities to your fork's entities:

| Cella Entity | Your Fork Entity | Realtime? | Offline? |
|--------------|------------------|-----------|----------|
| `page` | (your equivalent) | ✅/❌ | ✅/❌ |
| `attachment` | (your equivalent) | ✅/❌ | ✅/❌ |

Update `realtimeEntityTypes` and `offlineEntityTypes` in your `config/default.ts` accordingly.

---

## Troubleshooting

### "Cannot find module '~/query/offline'"
The new query modules weren't synced. Check if `frontend/src/query/` is in your ignored patterns.

### "Property 'realtimeEntityTypes' does not exist"
Add the new entity type arrays to your `config/default.ts`.

### Type errors in flush-stores.ts
Ensure the new sync-related imports are available from the synced query modules.

### Test failures with DEV_MODE
Update your test scripts to use the new mode pattern: `DEV_MODE=basic|core|full`
