# Quickstart

How to create, run, check, test, and customize a cella app.

## Create

The [`create-cella`](https://github.com/cellajs/cella-cli) CLI picks optional modules, ports, and a seed admin, then initializes a git repo with the cella upstream remote for later syncs:

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

Offline and PWA behavior needs a production-style frontend build: the Workbox service worker comes from VitePWA's `injectManifest` and does not run under `pnpm dev`.

```bash
# Builds the frontend + service worker and serves it with vite preview
# (on the port from appConfig.frontendUrl); also starts backend + CDC in dev mode
pnpm offline
```

## Customize & contribute

1. Set your app identity in `shared/config/config.default.ts`.
2. Model entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`.
3. Update root `package.json`; `.env` lists the secrets each feature needs (e.g. email).
4. The `*-config.ts` files and each package README describe the moving parts.
5. Uploads go through Transloadit into S3-compatible Object Storage, with a local-only fallback.
6. After a db schema change, run `pnpm generate` for a new drizzle migration.
7. Read the [architecture](./ARCHITECTURE.md) in your repo or on the cella docs site.
8. The [MDX files](../frontend/src/content/docs) mention cella documentation; change or remove them.

Contributions are welcome: [open an issue or PR](https://github.com/cellajs/cella).

## Cella CLI

Pulls upstream fixes, features, and dependency updates into your app while preserving your customizations. Docs: [@cellajs/cli](https://github.com/cellajs/cella-cli#readme).

```bash
pnpm cella
```

## Infra CLI

Deploys to [Scaleway](https://www.scaleway.com/) with Pulumi + GitHub Actions; CI runs zero-downtime deploys on push to `main`. The CLI generates the Docker Compose synth and drives the Pulumi tasks. Docs: [infra guide](../infra/README.md).

```bash
pnpm infra
```

## Bench CLI

Artillery load tests for backend, cdc, and yjs. Seeds deterministic data, runs declarative scenarios against your dev DB, and stores each run as a baseline for the next comparison. Docs: [bench guide](../bench/README.md).

```bash
pnpm bench
```
