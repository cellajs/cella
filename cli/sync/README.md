# @cellajs/sync

CLI tool to keep your Cella fork synchronized with the upstream boilerplate.

## Install

```bash
pnpm add -D @cellajs/sync
```

## Usage

```bash
# From monorepo root
pnpm sync

# Or directly
npx @cellajs/sync
```

## Commands

| Flag | Description |
|------|-------------|
| `--sync-service <type>` | `boilerplate-fork`, `boilerplate-fork+packages`, `packages`, or `diverged` |
| `--boilerplate-branch <branch>` | Boilerplate branch to sync from (default: `main`) |
| `--fork-branch <branch>` | Fork branch to sync into (default: `main`) |
| `--dry-run` | Preview changes without applying |

## Sync Services

- **boilerplate-fork** – Sync files from upstream, respecting swizzle rules
- **packages** – Sync `package.json` dependencies only
- **boilerplate-fork+packages** – Both file and dependency sync
- **diverged** – List files that have diverged from upstream

## Swizzle Configuration

Configure in `cella.config.ts`:

```ts
export default {
  swizzle: {
    removed: ['path/to/removed-file.ts'],    // Skip these files entirely
    ignored: ['path/to/custom-file.ts'],     // Keep fork version, ignore upstream
  }
}
```

## How It Works

1. **CLI** – Prompts for sync options (or uses flags)
2. **Setup** – Validates git state and branches
3. **Analyze** – Compares boilerplate vs fork files
4. **Sync** – Merges upstream changes, respects swizzle rules
5. **Packages** – Updates dependency versions from boilerplate

## Development

```bash
pnpm ts          # Type check
pnpm sync        # Run locally
```

## File Structure

```
src/
├── run-cli.ts       # CLI prompts and argument parsing
├── run-setup.ts     # Git validation and preflight checks
├── run-analyze.ts   # File diff analysis
├── run-sync.ts      # File synchronization logic
├── run-packages.ts  # package.json dependency sync
├── run-outdated.ts  # Enhanced pnpm outdated with links
├── config/          # Runtime configuration
├── modules/         # Core sync modules
├── utils/           # Git helpers, file operations
└── types/           # TypeScript interfaces
```
