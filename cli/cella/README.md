# @cellajs/cli

CLI tool to keep your app in sync with Cella.

## Overview

When you create a web app with Cella, you start from the template. We recommend `pnpm create @cellajs/cella`. Over time, Cella receives updates - bug fixes, new features, dependency updates. This CLI helps you pull those changes into your app while preserving your customizations.

## Usage

From your monorepo root:

```bash
pnpm cella
```

## Services

| Service | Description |
|---------|-------------|
| `analyze` | Dry run to see what would change on sync |
| `inspect` | Review drifted files, view diffs, pin or contribute upstream |
| `sync` | Merge upstream changes into your app |
| `packages` | Sync package.json keys with upstream |
| `audit` | Check for outdated packages & vulnerabilities |
| `forks` | Sync downstream to local fork repositories* |

\* `forks` only appears in the menu when you have `forks` configured in `cella.config.ts`. This is for upstream template developers who maintain multiple downstream forks from a single template repo.

## CLI Options

```bash
pnpm cella [options]
```

| Flag | Description |
|------|-------------|
| `--service <name>` | Choose service: `analyze`, `inspect`, `sync`, `packages`, `audit`, `forks` |
| `--list` | Non-interactive output for `inspect` (one file per line, useful for scripting) |
| `--log` | Write complete file list to `cella-sync.log` |
| `-V, --verbose` | Show detailed output during operations |
| `-v, --version` | Output the current version |
| `-h, --help` | Display help message |

## Configuration

Configure sync behavior in `cella.config.ts` at your monorepo root. A sensible default is already included after you created your app. To deviate files or folders from template:

- **`ignored`** - Files completely excluded from sync (existing and new)
- **`pinned`** - Full fork control: existing, modified, or deleted files are preserved

## Merge Strategy

The sync CLI uses **blob comparison** (file content) to determine what to sync. For each file, it evaluates in order:

1. **Ignored?** → Skip entirely (existing and new files)
2. **Content identical?** → Keep fork (nothing to do)
3. **Pinned?** → Keep fork version (existing, modified, or deleted)
4. **New file in upstream?** → Add file
5. **Content differs?** → Sync to upstream

This ensures your fork eventually matches upstream for all non-overridden files.

### Quick Reference

| Scenario | `ignored` | `pinned` | Default |
|----------|:---------:|:--------:|:-------:|
| Content identical | ✅ Keep | ✅ Keep | ✅ Keep |
| Content differs | ⏭️ Skip | ✅ Keep yours | ⬇️ Take upstream |
| New upstream file | ⏭️ Skip | ✅ Keep (respect deletion) | ➕ Add file |
| Deleted in upstream | ✅ Keep | ✅ Keep | 🗑️ Delete |
| Only in your app | ✅ Keep | ✅ Keep | ✅ Keep |

### Override Guide

| Goal | Action |
|------|--------|
| File should never sync (existing or new) | Add to `ignored` — file is completely hidden |
| Full fork control (keep, modify, or delete) | Add to `pinned` — your version always wins |
| Always match upstream | Leave unconfigured — syncs automatically |

### Tips

- Run `pnpm cella --sync-service analyze` first to preview changes without applying
- Use `pinned` for files you fully control (modify, keep, or delete)
- Use `ignored` for app-specific docs, assets, or config you fully own

## Status Indicators

During analysis and sync, files are displayed with status indicators:

| Symbol | Label | Meaning | Action |
|:------:|-------|---------|--------|
| ✓ | `identical` | Fork matches upstream | No action needed |
| ↑ | `ahead` | Fork changed (pinned/ignored) | Protected, keeping fork |
| ! | `drifted` | Fork changed, not protected | At risk, consider pinning |
| ↓ | `behind` | Upstream has changes | Will sync from upstream |
| ⇅ | `diverged` | Both sides changed | Will merge from upstream |
| ⨀ | `pinned` | Both changed, fork wins | Protected, keeping fork |

## Package.json Sync

The `packageJsonSync` setting controls which package.json sections are synced from upstream:

```typescript
packageJsonSync: ['dependencies', 'devDependencies', 'scripts']
```

**Supported keys:** `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, `scripts`, `engines`, `packageManager`, `overrides`

**Behavior:**
- **Adds** new keys from upstream
- **Updates** existing keys to match upstream versions
- Does **NOT remove** keys that only exist in your fork

This allows your fork to have extra dependencies or scripts without them being removed on each sync.

## Merge Strategy

The `mergeStrategy` setting controls how upstream changes are merged:

```typescript
mergeStrategy: 'merge' // default
```

| Strategy | Behavior | IDE Support |
|----------|----------|-------------|
| `merge` | Creates merge commit with full ancestry | Full 3-way merge for conflicts |
| `squash` | Stages all changes as one commit | No 3-way merge (manual resolution) |

**Use `merge` (default)** for:
- IDE 3-way merge support (VS Code, WebStorm)
- Tracking sync history via merge commits

**Use `squash`** for:
- Cleaner commit history (one commit per sync)
- When you prefer manual conflict resolution

## Development

```bash
cd cli/cella

# Type check
pnpm ts

# Run tests
pnpm test

# Run sync locally
pnpm cella
```