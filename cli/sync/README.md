# @cellajs/sync

CLI tool to keep your app in sync with Cella upstream template.

## Overview

When you create a web app with Cella, you start from the template. We recommend `pnpm create @cellajs/cella`. Over time, Cella receives updates - bug fixes, new features, dependency updates. This CLI helps you pull those changes into your app while preserving your customizations.

## Branch Model

The sync CLI uses a **two-branch model** to keep your app in sync with upstream:

### sync-branch (e.g., `sync-branch`)

The sync-branch maintains **full git ancestry** with upstream Cella. It:

- Contains actual upstream merge commits (not squashed)
- Enables accurate detection of "commits behind upstream"
- Allows proper three-way merges with conflict detection
- Is **local-only** — never pushed to your remote

This branch is essential because git determines merge relationships via commit SHAs. Without it, there's no way to know which upstream commits you've already synced.

### development branch (e.g., `development`)

Your working branch with **clean, squashed history**. After sync:

1. Upstream changes are first merged into `sync-branch` (with full history)
2. Then squash-merged into `development` (one clean commit)

This gives you the best of both worlds: proper upstream ancestry for merges, and clean history for your app's commits.

```
upstream/development ──────●────●────●────●  (Cella template)
                            \         \
sync-branch ─────────────────●─────────●───  (full merge history)
                              \         \
development ──────────────────■──────────■─  (squashed, clean)
```

## Usage

From your monorepo root:

```bash
pnpm sync
```

The CLI will guide you through the sync process interactively.

## Sync Services

| Service | Description |
|---------|-------------|
| `sync` | Full sync: merge Cella upstream changes into your app + update dependencies |
| `analyze` | Read-only analysis of file differences (no changes made) |
| `validate` | Validate that file paths in `cella.config.ts` overrides exist |

## CLI Options

```bash
pnpm sync [options]
```

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip prompts, use defaults (CI mode) |
| `-d, --debug` | Show verbose debug output |
| `--skip-packages` | Skip package.json dependency sync |
| `--sync-service <name>` | Choose service: `sync`, `analyze`, `validate` |
| `--upstream-branch <name>` | Override Cella upstream branch |
| `--fork-branch <name>` | Override your app's branch |
| `--fork-sync-branch <name>` | Override sync branch |

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

- Run `pnpm sync --sync-service analyze` first to preview changes without applying
- Use `pinned` for files you fully control (modify, keep, or delete)
- Use `ignored` for app-specific docs, assets, or config you fully own

## Status Indicators

During analysis and sync, files are displayed with status indicators:

| Symbol | Label | Meaning | Action |
|:------:|-------|---------|--------|
| ✓ | `identical` | Fork matches upstream | No action needed |
| ↑ | `ahead` | Fork has newer commits (pinned) | Protected, keeping fork |
| ␡ | `deleted` | Fork deleted file (pinned) | Kept deleted |
| ⚡ | `drifted` | Fork ahead, not protected | At risk, consider pinning |
| ↓ | `behind` | Upstream has newer commits | Will sync from upstream |
| ⇅ | `diverged` | Both sides have changes | Will merge from upstream |
| ⊡ | `locked` | Both sides changed, pinned | Protected, keeping fork |
| ⚠ | `unrelated` | No shared commit history | Manual resolution needed |
| ? | `unknown` | Could not determine status | Manual check needed |


## Development

```bash
cd cli/sync

# Type check
pnpm ts

# Run tests
pnpm test

# Run sync locally
pnpm sync
```