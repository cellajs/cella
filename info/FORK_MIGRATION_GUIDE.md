# Fork Migration Guide

This document provides instructions for AI agents (Copilot, Claude, etc.) to assist with migrating upstream Cella changes to a fork repository after running the sync CLI.

## Overview

When Cella (the upstream template) receives significant updates, forks need to migrate changes for files that are **ignored** or **pinned** in their `cella.config.ts`. The sync CLI handles most files automatically, but configuration files, entity models, and fork-specific customizations need manual migration.

## How to Use This Guide

### For the Upstream Repository (Cella)

When preparing a migration guide for a fork:

1. Get uncommitted changes: `git status` and `git diff` (or use `get_changed_files` tool in Copilot)
2. Fetch the fork's `cella.config.ts` to see its ignored/pinned patterns
3. Cross-reference changes against the fork's overrides to identify what needs manual migration
4. Generate a migration plan document (see template below)

### For the Fork Repository

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
- **Entity type changes**: Update `entityTypes`, `contextEntityTypes`, `productEntityTypes` arrays

**Example migration:**
```typescript
// Upstream added new feature flag
has: {
  pwa: true,
  sync: true,  // NEW: evaluate if fork needs this
  registrationEnabled: false,  // Keep fork's value
}
```

### 2. Entity Model Changes

When upstream adds new entity types or modifies existing ones:

- **New entity types**: Decide if fork needs them; if not, keep fork's entity arrays
- **Entity type category changes**: Update `offlineEntityTypes`, `realtimeEntityTypes` as needed
- **Column/field additions**: Review if fork's entities need corresponding changes

### 3. Sync Engine Primitives (Frontend)

New files in `frontend/src/query/` that provide sync capabilities:

- **New hooks/utilities**: Usually work as-is, but may need entity-type updates
- **Store changes**: Review if fork's stores need similar patterns
- **Type imports**: Ensure fork imports from `api.gen/` not duplicated types

### 4. Backend API Changes

- **Route changes**: If routes are pinned, review new routes in upstream
- **Handler patterns**: Look for new patterns (tx wrappers, conflict detection)
- **Schema changes**: New Zod schemas for sync primitives

### 5. Documentation (`info/*.md`)

Usually ignored by forks, but review for:
- Architecture changes that affect how fork should be structured
- New testing patterns
- Updated coding conventions

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
