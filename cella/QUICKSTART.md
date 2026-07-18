# Quickstart

Here we document how you can get started building your own web app with cella.

## Create

Cella is a template, not a framework. Create your own copy with the [`create-cella`](https://github.com/cellajs/cella-cli) CLI. It lets you pick optional modules, ports and a seed admin, then initializes a fresh git repo with the cella upstream remote wired up for future syncs:

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

Update openapi & sdk, check types and format/fix code style in one go:

```bash
pnpm check
```

## Run tests

See [Testing](/docs/page/guides/testing) for full documentation on writing and running tests.

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```

## Test offline & PWA

Offline and PWA behavior needs a production-style frontend build: the custom Workbox service worker is generated through VitePWA's `injectManifest` strategy and doesn't run under plain `pnpm dev`.

```bash
# Builds the frontend + service worker and serves it with vite preview
# (on the port from appConfig.frontendUrl); also starts backend + CDC in dev mode
pnpm offline
```

The service worker registers on `localhost` without HTTPS. There is currently no `offline:watch` script — rebuild to pick up frontend changes.

## Customize & contribute

1. Set your app identity and more in `shared/config/config.default.ts`.
2. Model your entities in `shared/config/hierarchy-config.ts` and access rules in `shared/config/permissions-config.ts`.
3. Update root `package.json`, and read `.env` to see which secrets are required (e.g. to send emails).
4. Explore the `*-config.ts` files and each package's README to learn the moving parts.
5. Uploads run through Transloadit into S3-compatible Object Storage, with a local-only fallback.
6. Changed the db schema? Run `pnpm generate` for a new drizzle migration.
7. Read the [architecture](/docs/page/architecture) and other info in your own repo or in cella docs.
8. The [MDX files](../frontend/src/content/docs) mention cella documentation, you might want to change or remove it.

Contributions are welcome: [open an issue or PR](https://github.com/cellajs/cella) to get involved.

## Cella CLI

Keep your app in sync with the Cella template - pull upstream bug fixes, features and dependency updates while preserving your customizations. It also covers auditing outdated/vulnerable packages, file stats, and (for template maintainers) syncing downstream forks.

See the [@cellajs/cli](https://github.com/cellajs/cella-cli#readme) package for full documentation, services, and configuration.

```bash
pnpm cella
```

## Infra CLI

Deploy your app to [Scaleway](https://www.scaleway.com/) using Pulumi + GitHub Actions. CI handles routine zero-downtime deploys on push to `main`. The CLI generates the Docker Compose synth and drives the Pulumi infrastructure tasks.

See [Deployment](/docs/page/guides/deployment) for full documentation and configuration.

```bash
pnpm infra
```

## Bench CLI

Artillery load testing to keep services such as backend, cdc and yjs performant. It seeds deterministic test data, runs declarative scenarios against your dev DB, and saves every run as a baseline to compare against the previous one.

See [Load testing](/docs/page/guides/load-testing) for full documentation and scenarios.

```bash
pnpm bench
```
