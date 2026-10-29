# Quickstart

This document explains how you can get started building a modern web app with cella.

### TL;DR

One command creates your app and five more run it with seeded data. Sign in as the seeded admin, shape the config to your product, and let `pnpm check` keep it consistent. The cella CLI brings in template updates, and the infra CLI deploys to Scaleway.

## Create

The [create-cella](https://github.com/cellajs/create-cella) CLI picks optional modules, ports, and a seed admin, then initializes a git repo with the cella upstream remote for later upgrades. Requirements: docker, node, [pnpm](https://pnpm.io/installation). Recommended: [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh), [gh cli](https://cli.github.com/)

```bash
pnpm create @cellajs/cella my-app
```

## Run

```bash
pnpm install
pnpm generate   # write your app's first db migration
pnpm docker     # start postgres and supporting services
pnpm seed       # seed test data
pnpm dev
```

The app opens at http://localhost:3000 (a git worktree gets ports of its own: [Dev ports](../shared/README.md#dev-ports)). Sign in as the seeded admin (`ADMIN_EMAIL` in `backend/.env`) with a magic link, which the backend prints in its console in development.

Seeded attachments render from a shared public development bucket: S3 and Transloadit keys are only needed to upload your own files. `pnpm dev` also starts the OAuth and MCP workers when `appConfig.services` enables them (off in the template).

## Check

Regenerates the OpenAPI spec and the SDK, checks types and schema evolution (`lens:check`), and fixes code style:

```bash
pnpm check
```

## Run tests

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```

## Test offline & PWA

Builds the frontend with its service worker and serves it with vite preview, beside the backend and CDC dev servers.

```bash
pnpm offline
```

## Customize & contribute

1. Set your app identity in `shared/config/config.default.ts`, and its colors and fonts in `frontend/src/styling/app.css`.
2. Model entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`. A coding agent with the `add-entity` skill takes a new entity from its hierarchy entry to a page that syncs.
3. Update root `package.json`. `.env` lists the secrets each feature needs (e.g. email).
4. The [MDX files](../frontend/src/content/docs) mention cella documentation. Change or remove them.
5. Start building!

Contributions are welcome: [open an issue or PR](https://github.com/cellajs/cella).

## Cella CLI

Pulls upstream fixes, features, and dependency updates into your app while preserving your customizations. Docs: [@cellajs/cli](https://github.com/cellajs/cella-cli#readme).

```bash
pnpm cella
```

## Infra CLI

Sets up and deploys a full stack on Scaleway ([infra guide](../infra/README.md)).

```bash
pnpm infra
```

## Bench CLI

Load tests against the dev stack ([bench guide](../bench/README.md)).

```bash
pnpm bench
```
