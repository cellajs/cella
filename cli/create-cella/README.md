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
| `--skip-new-branch` | Skip creating working branch |
| `--new-branch-name <name>` | Create working branch (e.g., `development`) |

## What It Does

1. Downloads latest Cella template via [giget](https://github.com/unjs/giget)
2. Cleans template files (removes cella-specific docs, configs)
3. Installs dependencies with `pnpm install`
4. Generates initial database migrations
5. Initializes git repository with initial commit
6. Creates optional working branch
7. Adds Cella as upstream remote for future syncs

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

