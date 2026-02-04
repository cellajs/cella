# Fork Migration Guide

Instructions for AI agents to migrate upstream Cella changes to a fork after running `pnpm cella`.

## Workflow

### 1. Prepare (multi-workspace recommended)

Have both cella and the fork open in VS Code so you can compare files directly.

### 2. Identify what needs migration

The sync CLI handles most files, but **pinned** and **ignored** files in `cella.config.ts` need manual review:

```bash
# In fork: see what changed since last sync
git log --oneline -5 sync-branch

# In cella: see recent upstream changes
git log --oneline --since="YYYY-MM-DD" development
git diff COMMIT_HASH..HEAD --name-only
```

Cross-reference changed files against the fork's `cella.config.ts` overrides.

### 3. Migration categories

| Category | Examples | Action |
|----------|----------|--------|
| **Config** | `config/default.ts` | Add new properties with fork-specific values |
| **Entity model** | New entity types, `entityConfig` | Adapt to fork's entities |
| **Backend routes** | Pinned route files | Review new patterns, apply relevant ones |
| **Frontend modules** | Query hooks, stores | Review if fork needs similar patterns |

### 4. Post-sync checklist

```bash
pnpm generate:openapi  # Regenerate API client
pnpm check             # Validate types and linting
pnpm test              # Verify nothing broke
```

## Key principles

- **Pinned files** (fork controls entirely): Compare upstream changes manually, cherry-pick what's relevant
- **Ignored files** (fork-specific): Usually no action needed
- **Synced files**: Automatic, but review for conflicts
- **Entity types**: Fork defines its own entities in `entityConfig` - upstream changes show patterns, not literal values to copy
