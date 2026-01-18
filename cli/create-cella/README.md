# @cellajs/create-cella

Scaffold a new Cella project from the template.

## Usage

```bash
pnpm create @cellajs/cella my-app
```

## Options

| Flag | Description |
|------|-------------|
| `--skip-install` | Skip `pnpm install` |
| `--skip-git` | Skip git initialization |
| `--skip-generate` | Skip database migration generation |
| `--skip-clean` | Keep template files (README, etc.) |
| `--skip-new-branch` | Skip creating a new branch |
| `--new-branch-name <name>` | Create additional branch (e.g., `development`) |

## Interactive Mode

Running without arguments prompts for:

1. **Project name** – Directory name and package name
2. **New branch** – Optionally create a dev branch alongside `main`
3. **Directory conflict** – If target exists, choose to cancel or continue

## What It Does

1. Downloads latest Cella template via [giget](https://github.com/unjs/giget)
2. Cleans template files (removes cella-specific docs, configs)
3. Installs dependencies with `pnpm install`
4. Generates initial database migrations (Drizzle SQL files)
5. Initializes git repository with initial commit
6. Creates optional development branch
7. Adds Cella as upstream remote (`cella-upstream`)

## Development

```bash
pnpm ts           # Type check
pnpm start        # Run locally (tsx)
pnpm build        # Build for npm publish
pnpm clean        # Remove dist folder
pnpm test-build   # Build and test
```

## Publishing

```bash
pnpm prepublishOnly  # Builds automatically
npm publish
```

