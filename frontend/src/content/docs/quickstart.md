---
title: Quickstart
description: Quick tips to get started building your own web app using cella.
order: -39
keywords: install, setup, dev, modules, deploy
updatedAt: 2026-07-09T08:01:16.810Z
---



Quick tips to get started building your own web app with cella. Also read the [architecture](/docs/page/architecture) info.

## Scaffold your project

Cella is a template you snapshot, not a dependency you install. Create your own copy with the `create-cella` CLI — it lets you pick optional modules, ports and a seed admin, then initializes a fresh git repo with the cella upstream remote wired up for future syncs:

```bash
pnpm create @cellajs/cella my-app
cd my-app
```

## Get it running

```bash
pnpm install
pnpm generate   # generate db migrations, openapi & sdk
pnpm docker     # start postgres and supporting services
pnpm seed       # seed test data
pnpm dev
```

## Update openapi & sdk + check types + format/fix code style

```bash
pnpm check
```

## Run tests

See [Testing](/docs/page/guides/testing) for full documentation on writing and running tests.

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```

## Customize & contribute

1. Set your app identity in `shared/config/config.default.ts` — name, urls, enabled modules and third-party keys.
2. Model your entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`.
3. Add your own metadata to `package.json`, and read `.env` to see which secrets are required (e.g. to send emails).
4. Explore the `*-config.ts` files and each package's README to learn the moving parts.
5. Uploads run through Transloadit into S3-compatible Scaleway Object Storage, with a local-only fallback for development.
6. Changed the db schema? Run `pnpm generate` for a new drizzle migration.

Contributions are welcome — [open an issue or PR](https://github.com/cellajs/cella) to get involved.

## Cella CLI

Keep your app in sync with the Cella template - pull upstream bug fixes, features and dependency updates while preserving your customizations. It also covers auditing outdated/vulnerable packages, file stats, and (for template maintainers) syncing downstream forks.

See the `@cellajs/cli` package for full documentation, services, and configuration.

```bash
pnpm cella
```

## Infra CLI

Deploy your app to [Scaleway](https://www.scaleway.com/) using Pulumi + GitHub Actions. CI handles routine zero-downtime deploys on push to `main`. The CLI generates the Docker Compose synth and drives the Pulumi infrastructure tasks.

See [Infra](/docs/page/guides/deployment) for full documentation and configuration.

```bash
pnpm infra
```

## Bench CLI

Artillery load testing to keep services such as backend, cdc and yjs performant. It seeds deterministic test data, runs declarative scenarios against your dev DB, and saves every run as a baseline to compare against the previous one.

See [Bench](/docs/page/guides/load-testing) for full documentation and scenarios.

```bash
pnpm bench
```
