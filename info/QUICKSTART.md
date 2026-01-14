# Quickstart

This document describes how to develop your own app based on Cella.

Also read the [architecture](./ARCHITECTURE.md) info.

## Run with [pglite](https://pglite.dev/)

```bash
pnpm install
pnpm quick
```

## Run it with full postgres and [electric-sync](https://electric-sql.com/) in docker

```bash
pnpm install
pnpm docker
pnpm seed
pnpm dev
```

## To check your types & format + fix code style

```bash
pnpm check
```


## Customize & contribute

1. Customize your config in `/config/default.ts`
2. Update package.json with your own metadata
3. Look at your `.env` file to understand what is required, for example to send emails you will need an API key.
4. Explore readmes and config files that start with `-config.ts`. For example for entities or navigation structure.
5. Cella uses Transloadit, TUS, S3-compatible Scaleway Object Storage and its Edge Services. However, you can also use local file storage during development. This gives you time to explore how to approach file handling for your app.
6. Changes in db schema? Use `pnpm generate` for a new db migration using drizzle.
7. Many things can be improved or are missing. Have a look at our roadmap and contact us to get involved.

## Cella CLI

Cella CLI is currently limited to: creating a cella project, listing diverged files and pulling upstream changes. Config can be found in `cella.config.ts`.

### List diverged

Receive a list of files that have diverged from cella itself. The files you have ignored in cella.config.ts will not be listed.

```bash
pnpm diverged
```

### Sync with upstream

Pull and sync upstream changes from cella repository.

```bash
pnpm sync
```

### Troubleshooting

When using `pnpm quick`, it could be that your local pglite is corrupted or has issues. Luckily its easy to clear it. Simply go to `/backend` and remove `.db` and retry.
