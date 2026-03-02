# Quickstart

This document describes how to develop your own app based on Cella. Also make sure to read the [architecture](./ARCHITECTURE.md) info.

## Recommended: run with full postgres and CDC worker

```bash
pnpm install
pnpm docker
pnpm seed
pnpm dev
```

## Quick alternative: run with [pglite](https://pglite.dev/)

```bash
pnpm install
pnpm quick
```

## Development modes

| Mode | Database | Docker | Use Case |
|------|----------|--------|----------|
| `none` | None | ❌ | OpenAPI generation, basic tests |
| `basic` | PGlite | ❌ | Fast local dev (`pnpm quick`) |
| `core` | PostgreSQL | ✅ | Standard development (`pnpm dev:core`) |
| `full` | PostgreSQL + CDC | ✅ | Complete features (`pnpm dev`) |

## To update sdk + check types + format/fix code style

```bash
pnpm check
```


## Customize & contribute

1. Customize your config in `shared/default-config.ts`, `shared/hierarchy-config.ts`, `shared/permissions-config.ts`
2. Update package.json with your own metadata
3. Look at your `.env` file to understand what is required, for example to send emails.
4. Explore readmes and config files that start with `-config.ts`.
5. Cella uses Transloadit with S3-compatible Scaleway Object Storage with local-only fallback.
6. Changes in db schema? Use `pnpm generate` for a new db migration using drizzle.
7. Many things can be improved or are missing. Have a look at our roadmap and contact us to get involved.

## Cella CLI

See [cli/cella/README.md](../cli/cella/README.md) for full documentation, services, and configuration.

```bash
pnpm cella
```

### Troubleshooting

When using `pnpm quick`, it could be that your local pglite is corrupted or has issues. Luckily its easy to clear it. Simply go to `/backend` and remove `.db` and retry.
