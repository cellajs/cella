# @cellajs/cli

CLI tool to keep your app in sync with Cella.

## Overview

When you create a web app with Cella, you start from the template. We recommend `pnpm create @cellajs/cella`. Over time, Cella receives updates - bug fixes, new features, dependency updates. This CLI helps you pull those changes into your app while preserving your customizations.

## Usage

From your monorepo root:

```bash
pnpm cella
```

Run a service directly:

```bash
pnpm cella analyze
pnpm cella sync --hard
pnpm cella audit --check-overrides
pnpm cella contributions --fork raak --json
```

## Services

| Service | Description |
|---------|-------------|
| `analyze` | Dry run to see what would change on sync |
| `inspect` | Review drifted files, view diffs, pin files |
| `sync` | Merge upstream changes into your app |
| `packages` | Sync package.json keys with upstream |
| `audit` | Check for outdated packages & vulnerabilities |
| `stats` | Count files by category and workspace package |
| `forks` * | Sync downstream to local fork repositories |
| `contributions` * | Pull and adopt changes from local forks |

\* `forks` and `contributions` only appear in the menu when you have `forks` configured in `cella.config.ts`. These are for upstream template developers who maintain multiple downstream forks.

## CLI Options

```bash
pnpm cella [service] [options]
```

Service-specific help is available via `pnpm cella <service> --help`.

| Service | Useful options |
|---------|----------------|
| analyze | `--log` |
| inspect | `--list`, `--json` |
| sync | `--log`, `--hard` |
| packages | No command-specific flags |
| audit | `--list`, `--force`, `--check-overrides` |
| forks | `--fork <name>`, `--log`, `--hard`, `-V, --verbose` |
| contributions | `--fork <name>`, `--list`, `--json`, `--diff <path>` |
| stats | `--coverage`, `-V, --verbose` |

| Global flag | Description |
|-------------|-------------|
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

- Run `pnpm cella analyze` first to preview changes without applying
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
| ◌ | `local` | Only in fork, never in upstream | No action needed |

## Package.json sync

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

## Contributions (pull from forks)

Upstream can pull modifications from local forks and selectively adopt them. This
enables a lightweight contribution flow without pull requests, driven entirely
from the upstream side.

### Configuration

List your local forks in `cella.config.ts`:

```typescript
forks: [
  {
    name: 'raak',
    localPath: '../raak',     // Path to the local fork clone
    pullBranch: 'development', // Branch cella pulls contributions FROM
    pushBranch: 'development', // Branch cella syncs changes INTO (forks service)
  },
],
```

### Pulling contributions

Run `pnpm cella` and choose **contributions** (or run `pnpm cella contributions`).
Select one or more forks; cella fetches each fork's `pullBranch`, builds a clean
local `contrib/<fork>` branch containing only that fork's contributed files, and
presents an interactive TUI:

| Key | Action |
|-----|--------|
| `↑↓` | Navigate files |
| `d` | View diff in terminal pager |
| `a` | Select all files from same fork |
| `space` | Toggle file selection |
| `enter` | Accept selected files (staged for commit) |
| `q` | Quit |

Accepted files are checked out from the contrib branch and staged — review and commit when ready.
