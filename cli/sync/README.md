# @cellajs/sync

CLI tool to keep your app in sync with Cella upstream template.

## Overview

When you create a web app with Cella, you start from the template. We recommend `pnpm create @cellajs/cella`. Over time, Cella receives updates - bug fixes, new features, dependency updates. This CLI helps you pull those changes into your app while preserving your customizations.

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

Configure sync behavior in `cella.config.ts` at your monorepo root. A sensible default is already included after you created your app.

- **`ignored`** - Files skipped entirely during sync (e.g., your app-specific docs)
- **`customized`** - Files you've modified; your version is preferred during merge conflicts

## Merge Strategy

The sync CLI evaluates each file through these questions, in order:

1. **Ignored?** → Skip upstream changes entirely (file is yours, untouched)
2. **Content identical?** → Keep fork (nothing to sync)
3. **Fork ahead/up-to-date?** → Keep fork (your changes are newer or current)
4. **Fork behind?** → Take upstream, *unless* `customized` → keep fork
5. **Diverged/unrelated?** → Manual resolve, *unless* `customized` → keep fork

### Quick Reference

| Scenario | `ignored` | `customized` | Default |
|----------|:---------:|:------------:|:-------:|
| Upstream changed only | ⏭️ Skip | ⬇️ Take upstream | ⬇️ Take upstream |
| You changed only | ⏭️ Skip | ✅ Keep yours | ✅ Keep yours |
| Both changed (diverged) | ⏭️ Skip | ✅ Keep yours | ⚠️ Manual resolve |
| New upstream file | ⏭️ Skip | ➕ Add file | ➕ Add file |
| Deleted in upstream | ⏭️ Skip | 🗑️ Delete | 🗑️ Delete |
| Only in your app | ✅ Keep | ✅ Keep | ✅ Keep |

### Override Guide

| Goal | Action |
|------|--------|
| File should never receive updates | Add to `ignored` — *"this file is mine, don't touch it"* |
| Preserve your modifications on conflicts | Add to `customized` — *"prefer my version when diverged"* |
| Accept normal git merge behavior | Leave unconfigured — deletions propagate, conflicts require resolution |

### Tips

- Run `pnpm sync --sync-service analyze` first to preview changes without applying
- Add frequently-modified files to `customized` to reduce merge conflicts
- Use `ignored` for app-specific docs, assets, or config you never want synced

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