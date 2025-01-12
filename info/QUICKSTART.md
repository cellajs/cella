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
pnpm dev
pnpm seed
```

## Customize
1. Customize your config in `/config/default.ts`
2. Update package.json with your own data
3. Look at your .env file to understand what is required, for example to send emails you will need an API key.
4. There are many config files with filenames like `-config.ts`. For example for entities or navigation structure.


## Cella CLI
Cella CLI is currently limited to: creating a cella project, listing diverged files and pulling upstream changes. Config can be found in `cella.config.js`.

### List diverged
Receive a list of files that have diverged from cella itself. The files you have ignored in cella.config.js will not be listed.

```bash
pnpm diverged
```

### Pull upstream
Pull upstream changes from cella. Changes in files that are in the cella ignore list will automatically be undone to reduce conflicts.

```bash
pnpm upstream:pull
```