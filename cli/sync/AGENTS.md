# Sync CLI Agent Guidelines

This document provides instructions for AI agents working on the Cella sync CLI.

## Purpose

The sync CLI keeps Cella forks up-to-date with the upstream template. It handles:
- Git operations (fetch, merge, checkout)
- File analysis and diffing
- Conflict resolution based on override rules
- Package.json dependency synchronization

## Tech Stack

- **Runtime**: Node.js (v24), tsx
- **CLI Framework**: Commander
- **Prompts**: @inquirer/prompts
- **Testing**: Vitest
- **Styling**: picocolors, yocto-spinner

## Architecture

```
cli/sync/
├── index.ts              # Entry point (imports src/index.ts)
├── src/
│   ├── index.ts          # Main orchestration
│   ├── run-cli.ts        # CLI argument parsing + prompts
│   ├── run-setup.ts      # Git validation and preflight
│   ├── run-outdated.ts   # Enhanced pnpm outdated
│   ├── config/           # Configuration management
│   ├── modules/          # Feature modules
│   │   ├── analyze/      # File diff analysis
│   │   ├── cli/          # CLI helpers (prompts, display, handlers)
│   │   ├── git/          # Git-specific analysis
│   │   ├── overrides/    # Override rule processing
│   │   ├── package/      # package.json sync
│   │   ├── setup/        # Preflight checks
│   │   └── sync/         # File sync execution
│   ├── types/            # TypeScript interfaces
│   └── utils/            # Shared utilities
│       ├── git/          # Git command wrappers
│       ├── files.ts      # File operations
│       └── progress.ts   # Progress indicators
└── tests/                # Vitest test files
```

## Key Patterns

### Configuration

Configuration uses an object + functions pattern (not a class):

```typescript
// config/config.ts
export const config = {
  get syncService() { return state.syncService; },
  set syncService(value) { state.syncService = value; },
  get fork() { return getFork(); },
  // ...
};
```

Custom config from `cella.config.ts` is merged with defaults at import time.

### Path Aliases

The CLI uses `#/` path aliases (like frontend/backend):

```typescript
import { config } from '#/config';
import { runAnalyze } from '#/modules/analyze';
```

Configured in:
- `tsconfig.json` - TypeScript compilation
- `package.json` `imports` field - Node.js runtime
- `vitest.config.ts` - Test runtime

### Module Structure

Each module in `src/modules/` follows this pattern:
- `index.ts` - Public exports (main run function)
- Feature-specific files for implementation

### Git Operations

Git commands are wrapped in `utils/git/`:
- `command.ts` - Low-level git command execution
- `helpers.ts` - High-level helpers (getCurrentBranch, etc.)
- `git-refs.ts` - Branch and remote operations
- `git-merge.ts` - Merge strategies

## Coding Style

Follow the main [AGENTS.md](/info/AGENTS.md) guidelines, plus:

- **No classes** - Use objects with getters/setters or plain functions
- **Async/await** - All git operations are async
- **Error handling** - Exit early with `process.exit(1)` on fatal errors
- **Console output** - Use `picocolors` for colored output
- **Progress** - Use `yocto-spinner` for long operations

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
```

Tests are in `tests/` directory. Name files `*.test.ts`.

## Commands

```bash
# From cli/sync directory
pnpm ts             # Type check
pnpm test           # Run tests
pnpm sync           # Run CLI locally

# From monorepo root
pnpm sync           # Run via pnpm filter
pnpm deps:outdated  # Check for outdated packages
```

## Common Tasks

### Adding a CLI Flag

1. Add variable in `run-cli.ts`
2. Add `.option()` to Commander chain
3. Add property to `CLIConfig` in `modules/cli/types.ts`
4. Handle in `onInitialConfigLoad()` in `modules/cli/handlers.ts`

### Adding a Sync Service

1. Add to `SYNC_SERVICES` in `config/sync-services.ts`
2. Add description in `getSyncServiceDescription()`
3. Handle in main `src/index.ts` orchestration

### Modifying Config

1. Update types in `config/types.ts`
2. Update defaults in `config/defaults.ts`
3. Update getters/setters in `config/config.ts`
