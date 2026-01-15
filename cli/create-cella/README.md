# @cellajs/create-cella

Scaffold a new Cella project from the template.

## Usage

```bash
# npm
npm create cella@latest my-app

# pnpm
pnpm create cella my-app

# yarn
yarn create cella my-app
```

## Options

| Flag | Description |
|------|-------------|
| `--skip-install` | Skip `pnpm install` |
| `--skip-git` | Skip git initialization |
| `--skip-generate` | Skip database migration generation |
| `--skip-clean` | Keep template files (README, etc.) |
| `-b, --branch <name>` | Create additional branch (e.g., `development`) |

## Interactive Mode

Running without arguments prompts for:

1. **Project name** – Directory name and package name
2. **New branch** – Optionally create a dev branch alongside `main`

## What It Does

1. Downloads latest Cella template via [giget](https://github.com/unjs/giget)
2. Cleans template files (removes cella-specific docs, configs)
3. Updates `package.json` with your project name
4. Initializes git repository
5. Creates optional development branch
6. Runs `pnpm install`
7. Generates initial database migrations

## Development

```bash
pnpm ts           # Type check
pnpm start        # Run locally (tsx)
pnpm build        # Build for npm publish
pnpm test-build   # Build and test
```

## Publishing

```bash
pnpm prepublishOnly  # Builds automatically
npm publish
```
