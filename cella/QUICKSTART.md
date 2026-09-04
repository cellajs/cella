# Quickstart

This document explains how you can get started building a modern web app with cella.

## Create

The [`create-cella`](https://github.com/cellajs/cella-cli) CLI picks optional modules, ports, and a seed admin, then initializes a git repo with the cella upstream remote for later syncs. Requirements: docker, node. Recommended: [git over ssh](https://docs.github.com/en/authentication/connecting-to-github-with-ssh), [gh cli](https://cli.github.com/)

```bash
pnpm create @cellajs/cella my-app
```

## Run

```bash
pnpm install
pnpm generate   # generate db migrations, openapi & sdk
pnpm docker     # start postgres and supporting services
pnpm seed       # seed test data
pnpm dev
```

## Check

Regenerates openapi & sdk, checks types, and fixes code style:

```bash
pnpm check
```

## Run tests

See [Testing](./TESTING.md) for writing and running tests.

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```

## Test offline & PWA

Builds the frontend + service worker and serves it with vite preview. Also starts servers in dev mode.

```bash
pnpm offline
```

## Customize & contribute

1. Set your app identity in `shared/config/config.default.ts`.
2. Model entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`.
3. Update root `package.json`. `.env` lists the secrets each feature needs (e.g. email).
4. Read the [architecture](./ARCHITECTURE.md) in your repo or on the cella docs site.
5. The [MDX files](../frontend/src/content/docs) mention cella documentation. Change or remove them.

Contributions are welcome: [open an issue or PR](https://github.com/cellajs/cella).

## Cella CLI

Pulls upstream fixes, features, and dependency updates into your app while preserving your customizations. Docs: [@cellajs/cli](https://github.com/cellajs/cella-cli#readme).

```bash
pnpm cella
```

## Infra CLI

Provisions and deploys a full stack on Scaleway ([infra guide](../infra/README.md)).

```bash
pnpm infra
```

## Bench CLI

Artillery load tests against the dev stack ([bench guide](../bench/README.md)).

```bash
pnpm bench
```
