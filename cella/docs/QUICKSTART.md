# Quickstart

This document explains how you can get started building a modern web app with cella.


## Create

The [create-cella](https://github.com/cellajs/create-cella) CLI is the best way to build a new web app. It initializes a git repo with cella upstream remote for later upgrades. Requirements: docker, Node.js 26, [pnpm 11](https://pnpm.io/installation). Recommended: [gh cli](https://cli.github.com/)

```bash
pnpm create @cellajs/cella my-app
```

## Run

```bash
pnpm install
pnpm generate   # writes first db migration
pnpm docker     # start postgres
pnpm seed       # seed test data
pnpm dev
```

The app opens at http://localhost:3000. A git worktree gets ports of its own ([Dev ports](../../shared/README.md#dev-ports)). Sign in with a magic link as the seeded admin (`ADMIN_EMAIL` in `.env`). The  link is shown in console in development.

Commit the migrations `pnpm generate` wrote and the SDK files the first `pnpm check` regenerates.

Seeded attachments render from a shared public development bucket. S3 and Transloadit keys are only needed to upload files. `pnpm dev` starts every service `appConfig.services` enables.

## Check

Regenerates the OpenAPI spec and the SDK, checks types and schema evolution, fixes code style:

```bash
pnpm check
```

## Run tests

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```

## Test offline & PWA

Builds the frontend with its service worker and serves it with vite preview.

```bash
pnpm offline
```

## Customize & contribute

1. Set your app identity in `shared/config/config.default.ts`, colors and fonts in `frontend/src/styling/app.css`.
2. Model entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`. A coding agent with the `add-entity` skill can help you.
3. Update root `package.json`. `.env` lists the secrets each feature needs, such as email.
4. The [MDX files](../../frontend/src/content/docs) mention cella documentation. Change or remove them.
5. Start building!

Contributions are welcome: [open an issue or PR](https://github.com/cellajs/cella).

## Cella CLI

Pulls upstream updates without overwriting local changes. Updates can contain alignments that can be used by yourself or your agents to align cella-owned and app-owned code.  Docs: [@cellajs/cli](https://github.com/cellajs/cella-cli#readme).

```bash
pnpm cella
```

## Setup & deploy

Set up and deploy the complete stack for your app on Scaleway ([infra guide](../infra/README.md)).

```bash
pnpm cella infra
```

## Load tests

Load tests against the dev stack ([bench guide](../../backend/bench/README.md)).

```bash
pnpm cella bench
```
