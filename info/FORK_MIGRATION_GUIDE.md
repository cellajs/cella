# Fork Migration Guide

This document provides instructions for AI agents (Copilot, Claude, etc.) to assist with migrating upstream Cella changes to a fork repository after running the sync CLI.

## Overview

When Cella (the upstream template) receives significant updates, forks need to migrate changes for files that are **ignored** or **pinned** in their `cella.config.ts`. The sync CLI handles most files automatically, but configuration files, entity models, and fork-specific customizations need manual migration.

## How to Use This Guide

### Multi-Workspace Setup (Recommended)

When both cella (upstream) and the fork are in the same VS Code workspace, the AI agent can:

1. **Compare directly**: Read both `cella/config/default.ts` and `fork/config/default.ts` side-by-side
2. **Check git history**: Run `git log --oneline --since="YYYY-MM-DD" development` in cella to see recent changes
3. **Diff files**: Compare specific files between repos to identify what needs migration
4. **Apply changes**: Make edits directly in the fork repository

**Workflow for agents:**
```bash
# 1. Check last sync date in fork
cd /path/to/fork && git log --oneline -5 sync-branch | grep "Merge cella-upstream"

# 2. See what changed in cella since then
cd /path/to/cella && git log --oneline --since="YYYY-MM-DD" development

# 3. Get list of changed files
git diff COMMIT_HASH..HEAD --name-only

# 4. Cross-reference with fork's cella.config.ts overrides
```

### For the Upstream Repository (Cella)

When preparing a migration guide for a fork:

1. Get recent changes: `git log --oneline --since="YYYY-MM-DD"` and `git diff --name-only OLD_COMMIT..HEAD`
2. Read the fork's `cella.config.ts` to see its ignored/pinned patterns
3. Cross-reference changes against the fork's overrides to identify what needs manual migration
4. Generate a migration plan document (see template below)

### For the Fork Repository (Single Workspace)

After running `pnpm sync` in your fork, provide this prompt to Copilot/Claude:

```markdown
## Context

I just synced my fork with upstream Cella using `pnpm sync`. The sync handled most file changes automatically, but I need to migrate changes for files that are ignored or pinned in my `cella.config.ts`.

## Fork Configuration

My `cella.config.ts` ignores/pins these files:
[Paste your cella.config.ts overrides section]

## Migration Plan

[Paste the migration plan generated from upstream]

## Instructions

Please help me:
1. Review the migration plan and identify which changes apply to my fork
2. For each applicable change, adapt it to my fork's entity model and config
3. Apply the changes while preserving my fork-specific customizations
```

---

## Migration Categories

### 1. Config Files (`config/default.ts`, `config/*.ts`)

These define app identity, features, entities, and settings. Migration typically involves:

- **New config properties**: Add new properties with appropriate fork-specific values
- **Changed property structure**: Update structure while preserving fork values
- **Feature flags**: Evaluate new `has.*` flags for your fork's needs
- **Entity config changes**: Review `entityConfig` structure if upstream refactored entity hierarchy

**Key patterns to watch:**
```typescript
// Upstream added entityConfig (replaces flat arrays)
entityConfig: {
  organization: { kind: 'context', parent: null, roles: ['admin', 'member'] },
  // Fork must add its custom entities here
  task: { kind: 'product', ancestors: ['workspace', 'project'] },
}
```

### 2. Entity Model Changes

When upstream adds new entity types or modifies existing ones:

- **New entity types**: Decide if fork needs them; if not, keep fork's entity arrays
- **Entity config structure**: If upstream added `entityConfig`, fork must populate with its entities
- **`realtimeEntityTypes`**: Entities that use the new SSE-based sync (was Electric-based)
- **Column/field additions**: Review if fork's entities need corresponding changes

### 3. Sync Engine Architecture (Major Change)

When upstream refactors the sync engine (e.g., Electric → SSE/CDC):

**Backend changes:**
- New `backend/src/sync/stream/` folder with dispatcher, subscriber manager
- New stream routes per entity (`backend/src/modules/<entity>/stream/`)
- CDC worker changes in `cdc/src/`
- Activity bus modifications

**Frontend changes:**
- New `frontend/src/query/realtime/` hooks (e.g., `use-sse-connection.ts`, `use-user-stream.ts`)
- Replaced `use-live-stream.ts` with entity-specific stream hooks
- New tab coordination and leader election patterns

**Fork implications:**
- If fork uses realtime for custom entities (e.g., `task`, `label`), must create stream routes
- Review if `realtimeEntityTypes` array needs updating
- Check if fork's sync patterns need migration

### 4. Backend API Changes

- **Route changes**: If routes are pinned, review new routes in upstream
- **Handler patterns**: Look for new patterns (tx wrappers, conflict detection)
- **Schema changes**: New Zod schemas for stream/sync primitives

### 5. Documentation (`info/*.md`)

Usually ignored by forks, but review for:
- Architecture changes that affect how fork should be structured
- New design decisions and invariants in requirements docs
- Updated testing patterns

---

## Migration Plan Template

Use this template when generating a migration plan for a specific fork:

```markdown
# Migration Plan: [Fork Name] - [Date]

## Upstream Commit/PR Reference
[Link to upstream changes or commit range]

## Summary
[Brief description of what changed in upstream]

## Changes Requiring Migration

### High Priority (Breaking/Required)

#### 1. [Change Title]
- **Upstream file**: `path/to/file.ts`
- **Fork equivalent**: `path/to/fork/file.ts` (if different)
- **What changed**: [Description]
- **Migration steps**:
  1. [Step 1]
  2. [Step 2]
- **Fork-specific considerations**: [Any notes about adapting to fork's model]

### Medium Priority (Recommended)

#### 2. [Change Title]
...

### Low Priority (Optional/Informational)

#### 3. [Change Title]
...

## Files Auto-Synced (No Action Needed)
- `path/to/file1.ts` - synced automatically
- `path/to/file2.ts` - synced automatically

## Files Ignored (Fork-Specific)
- `path/to/fork-file.ts` - intentionally different, no migration needed
```

---

## Common Migration Patterns

### Pattern A: Config Property Addition

When upstream adds a new property to `config/default.ts`:

```typescript
// Upstream added:
offlineEntityTypes: [] as const,
realtimeEntityTypes: ['attachment', 'page'] as const,

// Fork migration:
// 1. Identify fork's equivalent entities
// 2. Add properties with fork-appropriate values
offlineEntityTypes: [] as const,
realtimeEntityTypes: ['task', 'document'] as const,  // Fork's entities
```

### Pattern B: New Frontend Utility

When upstream adds new utilities in `frontend/src/query/`:

```typescript
// If fork uses same patterns, file should sync automatically
// If fork has custom query setup, review and adapt:

// 1. Check if utility uses EntityType
import type { RealtimeEntityType } from 'config';

// 2. Verify fork's entity types are compatible
// 3. Import utility in fork's module where needed
```

### Pattern C: API Schema Changes

When upstream modifies API schemas:

```typescript
// After sync, regenerate API client:
pnpm generate:openapi

// Then update fork-specific handlers if they override base patterns
```

### Pattern D: Store/State Changes

When upstream modifies Zustand stores:

```typescript
// Review changes to understand new state shape
// Update fork's store consumers if interface changed
// Consider if fork needs similar patterns
```

---

## Checklist After Migration

- [ ] Run `pnpm check` to validate types and linting
- [ ] Run `pnpm generate:openapi` if backend routes/schemas changed
- [ ] Run `pnpm generate` if database schemas changed
- [ ] Run `pnpm test` to verify nothing broke
- [ ] Review any new translation keys in `locales/`
- [ ] Update fork's README if significant changes were made

---

## Fork-Specific Notes

When creating a migration plan for a specific fork, include:

1. **Fork's entity model**: List the fork's custom entities vs Cella defaults
2. **Fork's ignored patterns**: Which files/folders are intentionally different
3. **Fork's pinned files**: Which files the fork fully controls
4. **Breaking changes**: Any upstream changes that require fork adaptation

---

## Troubleshooting

### Type errors after migration

1. Run `pnpm generate:openapi` to regenerate API types
2. Check for new imports needed from `config` or `api.gen/`
3. Verify entity type arrays match between config and usage

### Test failures after migration

1. Check if test fixtures need updating for new schemas
2. Verify mock data includes new required fields
3. Review test mode requirements (basic/core/full)

### Build errors

1. Check for new dependencies that need installation
2. Verify Vite/build config compatibility
3. Review any new environment variables needed

---

## Migration Plan: Raak - January 2026

### Upstream commit range
From: `747ced0d0` (last shared with raak on 2026-01-24)
To: `5fd3f11ac` (current development head)

### Summary
Major sync engine refactor: Cella moved from a mixed Electric/SSE approach to a unified SSE notification-style architecture with CDC (Change Data Capture). Key changes:
- New `backend/src/sync/stream/` dispatcher and subscriber manager
- New `frontend/src/query/realtime/` hooks replacing `use-live-stream.ts`
- New `entityConfig` structure in config (optional but recommended)
- Updated stream routes per entity module

### Raak entity model
- **Context entities**: `organization`, `workspace`, `project`
- **Product entities**: `task`, `label`, `attachment`, `page`
- **Realtime entities**: Currently `['attachment', 'page']` - may want to add `task`, `label`

### Changes requiring migration

#### 1. Config: `entityConfig` structure (Medium Priority)

**What changed**: Cella added a hierarchical `entityConfig` object that defines entity kinds, parents, and roles in one place.

**Upstream (cella/config/default.ts):**
```typescript
entityConfig: {
  user: { kind: 'user' },
  organization: { kind: 'context', parent: null, roles: ['admin', 'member'] },
  attachment: { kind: 'product', ancestors: ['organization'] },
  page: { kind: 'product', ancestors: [] },
} as const,
```

**Raak migration**: Add `entityConfig` to `raak/config/default.ts` with raak's entities:
```typescript
entityConfig: {
  user: { kind: 'user' },
  organization: { kind: 'context', parent: null, roles: ['admin', 'member'] },
  workspace: { kind: 'context', parent: 'organization', roles: ['admin', 'member', 'guest'] },
  project: { kind: 'context', parent: 'workspace', roles: ['admin', 'member', 'guest'] },
  task: { kind: 'product', ancestors: ['workspace', 'project'] },
  label: { kind: 'product', ancestors: ['workspace'] },
  attachment: { kind: 'product', ancestors: ['organization'] },
  page: { kind: 'product', ancestors: [] },
} as const,
```

**Status**: recommended for future compatibility.

#### 2. Config: `systemRoles` addition (Low Priority)

**What changed**: Cella added `systemRoles` config property.

**Upstream:**
```typescript
systemRoles: ['admin'] as const,
```

**Raak**: Already has `roles.systemRoles` in a different structure. Evaluate if migration needed.

#### 3. Backend stream infrastructure (High Priority)

**What changed**: New files in `backend/src/sync/stream/`:
- `build-message.ts` - Creates stream messages
- `dispatcher.ts` - Routes CDC events to SSE subscribers
- `send-to-subscriber.ts` - Writes to SSE connections

**Raak has**: Partial implementation in `backend/src/sync/stream/` but missing:
- `build-message.ts`
- `dispatcher.ts`
- `send-to-subscriber.ts`

**Migration**: After sync, these files should be added. Review if raak's `task` and `label` modules need stream routes.

#### 4. Frontend realtime hooks (High Priority)

**What changed**: Cella replaced `use-live-stream.ts` with:
- `use-sse-connection.ts` - Base SSE connection management
- `use-user-stream.ts` - User-scoped stream
- `use-page-live-stream.ts` - Entity-specific stream
- `use-visibility-reconnect.ts` - Reconnect on tab visibility
- `use-leader-reconnect.ts` - Leader tab reconnection
- `user-stream-handler.ts` - Message handling
- `hydrate-barrier.ts` - Prevents hydration races

**Raak has**: Old `use-live-stream.ts` pattern.

**Migration**: 
1. Sync should bring new files
2. Update raak's modules that use realtime to use new hooks
3. For `task`/`label` entities, create similar patterns to `use-page-live-stream.ts`

#### 5. Entity stream routes (Medium Priority)

**What changed**: Each realtime entity now has its own stream folder:
- `backend/src/modules/page/stream/` - route, can-receive, build-message, etc.
- `backend/src/modules/attachment/stream/` (if realtime)

**Raak impact**: If raak wants realtime `task`/`label`:
1. Create `backend/src/modules/task/stream/` folder
2. Create `backend/src/modules/label/stream/` folder
3. Wire into main routes

#### 6. Config types (Low Priority)

**What changed**: `config/types.ts` updated with new type helpers for entityConfig.

**Migration**: Should sync automatically.

### Files auto-synced (no action needed)
- `backend/src/sync/activity-bus.ts`
- `backend/src/sync/cdc-websocket.ts`
- `cdc/src/` (entire folder)
- `frontend/src/query/realtime/tab-coordinator.ts`
- `info/SYNC_ENGINE_REQUIREMENTS.md`
- `info/HYBRID_SYNC_ENGINE_PLAN.md`

### Files ignored by raak (no sync)
- `backend/drizzle/*` - Raak has its own migrations
- `frontend/src/api.gen/*` - Regenerated with `pnpm generate:openapi`
- `cli/create-cella/*` - Not used by forks

### Files pinned by raak (keep raak version)
- `config/default.ts` - Raak's entity model
- `frontend/src/routes/route-tree.tsx` - Raak's routes
- `backend/src/routes.ts` - Raak's route registration
- `backend/src/permissions/permissions-config.ts` - Raak's permissions

### Recommended post-sync actions

1. **Run sync**: `pnpm sync` in raak
2. **Review conflicts**: Check any merge conflicts in sync-branch
3. **Update config**: Add `entityConfig` to raak's config/default.ts
4. **Regenerate types**: `pnpm generate:openapi`
5. **Run checks**: `pnpm check` to validate types
6. **Test**: `pnpm test` to verify functionality
7. **Evaluate realtime**: Decide if task/label need realtime support
