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
3. Look at you .env file to understand what is required and update accordingly 
4. There are many config files, which end with '-config.ts'. Here you can set for example your entity structure or your navigation structure.


## Cella CLI
Cella CLI is currently limited to: creating a cella project, listing diverged files and pulling upstream changes. Config can be found in `cella.config.js`.

### 1. List diverged
Receive a list of files that have diverged from cella itself. The files you have ignored in cella.config.js will not be listed.

```bash
pnpm diverged
```

### 2. Pull upstream
Pull upstream changes from cella. Changes in files that are in the cella ignore list will automatically be undone to reduce conflicts.

```bash
pnpm upstream:pull
```