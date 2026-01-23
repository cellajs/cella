# @cellajs/create-cella

CLI tool to scaffold a new Cella project from the template.

## Overview

This CLI creates a new Cella project by downloading the latest template, setting up your development environment, and configuring git with upstream tracking for future syncs.

## Usage

```bash
pnpm create @cellajs/cella my-app
```

Running without arguments starts interactive mode, prompting for:

1. **Project name** – Directory name and package name
2. **New branch** – Optionally create a dev branch alongside `main`
3. **Directory conflict** – If target exists, choose to cancel or continue

## CLI Options

```bash
pnpm create @cellajs/cella [directory] [options]
```

| Flag | Description |
|------|-------------|
| `--skip-install` | Skip `pnpm install` |
| `--skip-git` | Skip git initialization |
| `--skip-generate` | Skip database migration generation |
| `--skip-clean` | Keep template files (README, etc.) |
| `--skip-new-branch` | Skip creating a new branch |
| `--new-branch-name <name>` | Create additional branch (e.g., `development`) |

## What It Does

1. Downloads latest Cella template via [giget](https://github.com/unjs/giget)
2. Cleans template files (removes cella-specific docs, configs)
3. Installs dependencies with `pnpm install`
4. Generates initial database migrations (Drizzle SQL files)
5. Initializes git repository with initial commit
6. Creates optional development branch
7. Adds Cella as upstream remote for future syncs

## After Setup

Once your project is created:

```bash
cd my-app
pnpm quick          # Quick start with PGlite (no Docker)
# or
pnpm docker && pnpm dev && pnpm seed   # Full setup with PostgreSQL
```

Sign in with:
- Email: `admin-test@cellajs.com`
- Password: `12345678`

## Keeping in Sync

Your project is configured with Cella as an upstream remote. To pull future updates:

```bash
pnpm sync
```

See [@cellajs/sync](../sync/README.md) for details on the sync process.

## Development

```bash
cd cli/create-cella

# Type check
pnpm ts

# Lint
pnpm lint:fix

# Run tests
pnpm test

# Run locally
pnpm start

# Build for npm publish
pnpm build
```

