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

### Override Categories

- **`ignored`** - Files skipped entirely during sync (e.g., your app-specific docs)
- **`customized`** - Files you've modified; your version is preferred during merge conflicts

## Merge Strategy

The sync CLI uses git merge with special handling based on file status and overrides:

| Scenario | In `ignored` | In `customized` | Default |
|----------|--------------|-----------------|---------|
| **Changed in upstream only** | Skip | Take upstream | Take upstream |
| **Changed in your app only** | Skip | Keep yours | Keep yours |
| **Changed in both (diverged)** | Skip | **Keep yours** | Manual resolve |
| **New file in upstream** | Skip | Add file | Add file (git merge) |
| **Deleted in upstream** | Skip | Delete | Delete (git merge) |
| **Only in your app** | Keep | Keep | Keep |

### Key Behaviors

- **`ignored` files** are skipped - sync reverts any upstream changes to these files
- **`customized` files** prefer your version when both sides have changes (diverged)
- **Default behavior** uses standard git merge - deletions propagate, conflicts require manual resolution
- **New upstream files** are added via git merge (unless in `ignored`)
- **Your app-only files** are never touched - they don't exist in upstream analysis

### Tips

- Add frequently-modified files to `customized` to reduce merge conflicts
- Use `ignored` for files that should never sync (app-specific docs, assets)
- Run `pnpm sync --sync-service analyze` first to preview changes without applying

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