# Sync CLI v2 - Implementation Plan

## Overview

Rewrite the sync CLI to use a **worktree-based merge approach** that isolates all merge operations from the main repository. Files in the main repo don't change until the final atomic rsync copy.

## Core architecture change

**Current approach:**
```
checkout sync-branch → merge upstream → validate → squash to development
```

**New approach:**
```
create worktree from forkBranch → merge upstream in worktree → validate → rsync to main repo
```

## Benefits

1. **No file changes in main repo during sync** - IDE won't see files changing mid-operation
2. **Easy abort/cleanup** - Just delete the worktree directory
3. **No sync-branch needed** - Worktree provides isolation
4. **No squash needed** - Direct merge commits, cleaner git history
5. **Atomic apply** - rsync copies everything at the end, or nothing

## Services

Three services, all using the shared merge-engine:

| Service | Purpose |
|---------|---------|
| **analyze** | Dry run of sync - shows what would change without applying |
| **sync** | Performs the actual merge in worktree, applies result |
| **packages** | Syncs package.json dependencies |

Note: `validate` (pnpm install && pnpm check) runs automatically after sync, not as a separate service.

### Analyze = Dry run of Sync

`analyze` and `sync` use the exact same merge-engine code. The only difference:
- **analyze**: Creates worktree, performs merge, shows results, **discards worktree**
- **sync**: Creates worktree, performs merge, shows results, **applies via rsync**, then discards worktree

This ensures analyze output perfectly matches what sync will do.

### Service flow

```
┌─────────────────────────────────────────────────────────────┐
│                      merge-engine                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  worktree   │  │   merge     │  │   rsync apply       │ │
│  │  create     │→ │   resolve   │→ │   (atomic copy)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
        ↑                   ↑                    ↑
   ┌────┴────┐         ┌────┴────┐          ┌────┴────┐
   │ analyze │         │  sync   │          │ packages│
   │ (skip   │         │ (apply) │          │         │
   │  apply) │         └─────────┘          └─────────┘
   └─────────┘
```

## CLI flags

| Flag | Description |
|------|-------------|
| `--service <name>` | Service to run: `analyze`, `sync`, `packages` (required) |
| `--log` | Write complete file list to `cella-sync.log` in repo root |
| `--verbose, -v` | Show detailed output during operations |

**Examples:**
```bash
pnpm sync --service analyze      # Run analyze (dry run)
pnpm sync --service sync         # Run sync
pnpm sync --service analyze --log # Write full file list to cella-sync.log
```

## Config simplification

### Remove
- `forkSyncBranch` - worktree provides isolation
- `maxSquashPreviews` - no squash step
- `verbose` - CLI flag only, not config

### Keep
```typescript
interface CellaSyncConfig {
  // Upstream
  upstreamUrl: string;
  upstreamBranch: string;
  upstreamRemoteName?: string;
  
  // Fork
  forkBranch: string;
  
  // Options
  packageJsonSync?: PackageJsonSyncKey[];
  
  // Overrides
  overrides?: {
    ignored?: string[];  // Patterns allowed
    pinned?: string[];   // Exact paths only
  };
}
```

## Overrides behavior

### Ignored (patterns allowed)
- **Fork-only territory**: upstream cannot add, modify, or delete these
- Supports glob patterns (e.g., `backend/drizzle/*`)
- **Critical**: Ignored files from upstream must be explicitly deleted after merge
- Files are excluded from conflict resolution - fork version always wins
- New upstream files matching ignored patterns are removed

**Post-merge cleanup for ignored files:**
```typescript
// After merge, before rsync apply:
// 1. Find all files in worktree matching ignored patterns
// 2. If file exists in worktree but shouldn't (upstream added it): DELETE
// 3. If file exists in fork but not worktree (fork-only): ensure it's preserved via rsync
```

```typescript
ignored: [
  "backend/drizzle/*",
  "backend/scripts/seeds/data/*",
  "cli/create-cella/*",
  "frontend/public/static/docs.gen/*",
  "frontend/public/static/icons/*",
  "frontend/public/static/images/*",
  "frontend/public/static/logo/*",
  "frontend/public/static/screenshots/*",
  "frontend/src/api.gen/*",
  "frontend/src/modules/common/bg-animation/*",
  "info/QUICKSTART.md",
]
```

### Pinned (exact paths only)
- **Fork wins on conflicts**, but non-conflicting upstream changes merge normally
- No wildcards - use `ignored` for patterns
- If fork deleted a pinned file, deletion is respected (upstream can't re-add)
- Pinned files that conflict: resolve as "ours" (fork version)

**Pinned conflict resolution:**
```typescript
// During merge conflict resolution:
// 1. If file is pinned and has conflict: git checkout --ours <file>
// 2. If file is pinned and fork deleted it: git rm <file>
```

### Config validation

On startup, validate the overrides config and warn about issues:

**Pinned validation:**
- ⚠️ Warn if path contains glob patterns (`*`, `**`, `?`) - should use `ignored` instead
- ⚠️ Warn if path doesn't exist in fork (typo or file was removed)

**Ignored validation:**
- ⚠️ Warn if pattern doesn't match any files in fork or upstream

```typescript
// Example validation output:
// ⚠️  pinned path contains glob pattern (use ignored instead): "frontend/public/static/icons/*"
// ⚠️  pinned path not found in fork: "frontend/src/old-config.tsx"
// ⚠️  ignored pattern matches no files: "backend/obsolete/*"
```

Validation warnings don't block sync - they just inform the user of potential config issues.

```typescript
pinned: [
  "README.md",
  "package.json",
  "lefthook.yaml",
  "pnpm-lock.yaml",
  "render.yaml",
  "compose.yaml",
  "cella.config.ts",
  "config/default.ts",
  "config/development.ts",
  "config/staging.ts",
  "config/test.ts",
  "config/production.ts",
  "config/tunnel.ts",
  "frontend/package.json",
  "frontend/public/favicon.ico",
  "frontend/public/favicon.svg",
  "frontend/public/static/openapi.json",
  "frontend/src/nav-config.tsx",
  "frontend/src/routes-resolver.ts",
  "frontend/src/routes-config.tsx",
  "frontend/src/menu-config.tsx",
  "frontend/src/alert-config.tsx",
  "frontend/src/offline-config.tsx",
  "frontend/src/styling/gradients.css",
  "frontend/src/routes/route-tree.tsx",
  "frontend/src/routes/marketing-routes.tsx",
  "frontend/src/modules/common/app/app-sheets.tsx",
  "frontend/src/modules/common/logo.tsx",
  "frontend/src/modules/common/blocknote/blocknote-config.ts",
  "frontend/src/modules/home/index.tsx",
  "frontend/src/modules/home/onboarding/onboarding-config.ts",
  "frontend/src/modules/marketing/marketing-config.tsx",
  "frontend/src/modules/marketing/about/about-page.tsx",
  "backend/package.json",
  "backend/src/custom-env.ts",
  "backend/src/table-config.ts",
  "backend/src/relatable-config.ts",
  "backend/src/routes.ts",
  "backend/src/permissions/permissions-config.ts",
  "backend/src/docs/tags-config.ts",
  "json/text-blocks.json",
  "locales/en/about.json",
  "locales/en/app.json"
]
```

## File structure

Build v2 completely separate from existing v1 code:

```
cli/sync/
├── src/                    # v1 (existing, unchanged)
│   ├── modules/
│   ├── utils/
│   ├── config/
│   └── index.ts
├── src-v2/                 # v2 (new, isolated)
│   ├── services/
│   │   ├── merge-engine.ts # Worktree create, merge, conflict resolution, rsync apply
│   │   ├── analyze.ts      # Dry run - uses merge-engine, discards result
│   │   ├── sync.ts         # Full sync - uses merge-engine, applies result
│   │   ├── packages.ts     # package.json dependency sync
│   │   └── validate.ts     # pnpm install && pnpm check
│   ├── utils/
│   │   ├── cleanup.ts      # Worktree cleanup, SIGINT/SIGTERM handlers
│   │   ├── git.ts          # Git command helpers
│   │   └── overrides.ts    # Override matching and validation
│   ├── config/
│   │   └── types.ts        # Simplified config types
│   ├── cli.ts              # CLI entry point with commander
│   └── index.ts            # Main orchestrator
├── IMPLEMENTATION_PLAN.md
└── package.json
```

### Migration strategy
1. Build v2 in `src-v2/` without touching v1
2. Test thoroughly against raak repo
3. Once stable, update `package.json` bin to point to v2
4. Eventually remove v1 code

## Analysis output

### Default output (summary)
Shows counts by status category in terminal.

### With `--log` flag
Writes complete file list to `cella-sync.log` in repo root. Contains:
- `identical` - no changes needed
- `ahead` - fork ahead, protected (pinned/ignored)
- `drifted` - fork ahead, NOT protected (⚠️ at risk)
- `behind` - upstream has changes to sync
- `diverged` - both changed, will merge
- `pinned` - fork wins on conflict
- `ignored` - excluded from sync entirely
- `deleted` - fork deleted, will stay deleted

### After summary, show two actionable lists:
1. **Sync from upstream** - files that will receive changes (behind, diverged)
2. **Drifted from upstream** - files at risk (fork ahead, not protected)

## Testing

### Test setup
- **Code**: Use CLI from `/Users/flip/Sites/cella/cli/sync`
- **Target repo**: Test against `/Users/flip/Sites/raak`
- **Environment variable**: `CELLA_FORK_PATH=/Users/flip/Sites/raak`

This allows testing the cella CLI code against the raak fork without needing to copy code.

```bash
# Run analyze against raak using cella's CLI code
cd /Users/flip/Sites/cella
CELLA_FORK_PATH=/Users/flip/Sites/raak pnpm sync --dry-run

# Run full sync
CELLA_FORK_PATH=/Users/flip/Sites/raak pnpm sync -y
```

### E2E test scenarios
1. **Clean sync** - no conflicts, upstream changes apply cleanly
2. **Pinned conflict** - pinned file has conflict, fork version wins
3. **Ignored deletion** - upstream adds file in ignored path, gets deleted
4. **Drifted warning** - fork has changes in non-protected file
5. **Abort/cleanup** - Ctrl+C during sync, worktree cleaned up
6. **Leftover detection** - previous sync interrupted, detect and clean

## Conflict handling

After merge in worktree, before applying to main repo:
- **Ready files**: Stage all successfully merged files (auto-resolved + no conflicts)
- **Conflict files**: Leave unstaged so they appear in `git status`
- User can review conflicts via `git status` and `git diff`
- Conflicts must be resolved manually before next sync attempt

## rsync behavior

- Preserve fork-only untracked files (files in fork but not in git)
- Use `--exclude` patterns for `.git/`, `node_modules/`, etc.
- Atomic copy: all or nothing

## Cleanup & abort handling

- Register SIGINT/SIGTERM handlers before creating worktree
- On abort: clean up worktree directory, prune git worktree references
- On startup: detect leftover worktree from previous interrupted run, prompt to clean

## Implementation phases

### Phase 1: Setup v2 structure
- [ ] Create `src-v2/` directory
- [ ] Setup `cli.ts` with commander (flags: --log, -y, --dry-run, -v)
- [ ] Create simplified `config/types.ts`
- [ ] Setup tsconfig/build for v2

### Phase 2: Core services
- [ ] `utils/cleanup.ts` - worktree cleanup + signal handlers
- [ ] `utils/git.ts` - git command helpers
- [ ] `utils/overrides.ts` - override matching + validation
- [ ] `services/merge-engine.ts` - worktree create, merge, rsync apply, ignored file deletion

### Phase 3: Main services
- [ ] `services/analyze.ts` - dry run using merge-engine
- [ ] `services/sync.ts` - full sync using merge-engine
- [ ] `index.ts` - main orchestrator

### Phase 4: Override handling
- [ ] Implement config validation (warn on glob in pinned, missing paths)
- [ ] Implement ignored file post-merge deletion
- [ ] Implement pinned conflict resolution
- [ ] Test fork deletion preservation for pinned files

### Phase 5: Additional services
- [ ] `services/packages.ts` - package.json dependency sync
- [ ] `services/validate.ts` - pnpm install && pnpm check

### Phase 6: Testing & migration
- [ ] E2E tests against raak repo
- [ ] Test abort/cleanup scenarios
- [ ] Update package.json bin to point to v2
- [ ] Update documentation
- [ ] (Later) Remove v1 code

## Resolved decisions

1. **`--log` output**: Writes to `cella-sync.log` file in repo root (not stdout)
2. **Conflict handling**: Stage ready files, leave conflicts unstaged for `git status` visibility
3. **rsync preservation**: Yes, preserve fork-only untracked files not in git
---

## TUI Examples

### No service flag (shows warnings + inquirer prompt)

```
$ pnpm sync

cella sync v2.0.0
─────────────────────────────────────────────────

⚠ pinned path not found: "frontend/src/old-file.tsx"
⚠ pinned contains glob pattern: "config/*" (use ignored for patterns)

? Choose a service: (Use arrow keys)
❯ analyze    dry run, show what would change
  sync       merge upstream changes into fork
  packages   sync package dependencies only
```

### Startup with --service flag (skips prompts)

```
$ pnpm sync --service analyze

cella sync v2.0.0
─────────────────────────────────────────────────

◐ Creating worktree at .cella-sync-worktree...
```

### Analyze: Progress

```
◐ Creating worktree at .cella-sync-worktree...
◐ Fetching upstream (cellajs/cella:development)...
  Latest: a1b2c3d "fix: auth token refresh" (2 days ago)
◐ Performing merge (dry run)...
◐ Analyzing 847 files...
✓ Analysis complete
```

### Analyze: Summary output

```
Summary
─────────────────────────────────────────────────

  ✓ 823  identical      no action needed
  ↑  12  ahead          fork is ahead (protected)
  ⚡  3  drifted        fork is ahead (NOT protected)
  ↓   6  behind         will sync from upstream
  ⇅   2  diverged       will merge from upstream
  ⊡   1  locked         both changed, keeping fork (pinned)

Sync from upstream (8 files)
─────────────────────────────────────────────────

  ↓ backend/src/modules/auth/handlers.ts
  ↓ backend/src/modules/users/schema.ts
  ↓ frontend/src/modules/auth/sign-in.tsx
  ↓ frontend/src/modules/common/data-table/index.tsx
  ↓ frontend/src/lib/router.ts
  ↓ locales/en/common.json
  ⇅ package.json
  ⇅ pnpm-lock.yaml

⚠ Drifted from upstream (3 files)
─────────────────────────────────────────────────

  ⚡ backend/src/utils/helpers.ts
  ⚡ frontend/src/modules/home/dashboard.tsx  
  ⚡ frontend/src/styling/theme.css

  These files have fork changes but are NOT pinned or ignored.
  Consider adding to pinned before running sync.

This was a dry run. Run 'pnpm sync --service sync' to apply.
```

### Analyze: With --log flag (full file list)

```
Complete file list (847 files)
─────────────────────────────────────────────────

  ✓ identical    .gitignore
  ✓ identical    .npmrc
  ✓ identical    backend/package.json
  ⊙ ignored      backend/drizzle/0001_init.sql
  ⊙ ignored      backend/drizzle/0002_users.sql
  📌 pinned       cella.config.ts
  📌 pinned       config/default.ts
  ↓ behind       backend/src/modules/auth/handlers.ts
  ⚡ drifted      backend/src/utils/helpers.ts
  ↑ ahead        frontend/src/nav-config.tsx
  ⇅ diverged     package.json
  ⊡ locked       README.md
  ...
```

### Sync: Progress & completion

```
◐ Creating worktree at .cella-sync-worktree...
◐ Fetching upstream (cellajs/cella:development)...
  Latest: a1b2c3d "fix: auth token refresh" (2 days ago)
◐ Merging upstream into fork...
  → README.md: keeping fork (pinned)
  → package.json: merging changes
  → config/default.ts: keeping fork (pinned)
◐ Removing ignored upstream additions...
  → cli/create-cella/template/README.md
◐ Applying changes to repository...
✓ Sync complete

  8 files updated, 2 merged, 1 removed
  
Run 'pnpm install' to update dependencies.
```

### Abort handling (Ctrl+C)

```
◐ Merging upstream into fork...
^C
⚠ Interrupted - cleaning up worktree...
✓ No changes were made to your repository.
```
