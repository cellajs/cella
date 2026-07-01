# Quickstart

This document gives some quick tips to get started with building your own web app using cella. We assume you already used `pnpm create @cellajs/cella` to install the template. Also make sure to read the [architecture](./ARCHITECTURE.md) info.

When you finished installing cella, use:

```bash
pnpm install
pnpm generate
pnpm docker
pnpm seed
pnpm dev
```

## Update openapi & sdk + checks types + format/fix code style

```bash
pnpm check
```

## Run tests

See [TESTING.md](./TESTING.md) for full documentation on writing and running tests.

```bash
pnpm test # Run tests (excluding ui stories)
pnpm story # Start storybook
```



## Customize & contribute

1. Customize your config in `shared/config/config.default.ts`, `shared/config/hierarchy-config.ts`, `shared/config/permissions-config.ts`
2. Update package.json with your own metadata
3. Look at your `.env` file to understand what is required, for example to send emails.
4. Explore readmes and config files that start with `-config.ts`.
5. Cella uses Transloadit with S3-compatible Scaleway Object Storage with local-only fallback.
6. Changes in db schema? Use `pnpm generate` for a new db migration using drizzle.
7. Many things can be improved or are missing. Contact us to get involved!

## Cella CLI

Keep your app in sync with the Cella template - pull upstream bug fixes, features and dependency updates while preserving your customizations. It also covers auditing outdated/vulnerable packages, file stats, and (for template maintainers) syncing downstream forks.

See [cli/cella/README.md](../cli/cella/README.md) for full documentation, services, and configuration.

```bash
pnpm cella
```

## Infra CLI

Deploy your app to [Scaleway](https://www.scaleway.com/) using Pulumi + GitHub Actions. CI handles routine zero-downtime deploys on push to `main`. The CLI generates the Docker Compose synth and drives the Pulumi infrastructure tasks.

See [infra/README.md](../infra/README.md) for full documentation and configuration.

```bash
pnpm infra
```

## Bench CLI

Artillery load testing to keep services such as backend, cdc and yjs performant. It seeds deterministic test data, runs declarative scenarios against your dev DB, and saves every run as a baseline to compare against the previous one.

See [bench/README.md](../bench/README.md) for full documentation and scenarios.

```bash
pnpm bench
```

