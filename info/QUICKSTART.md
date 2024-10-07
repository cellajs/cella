# Quickstart
This document describes how to develop your own app based on Cella, after forking it.

Also read the [architecture](./ARCHITECTURE.md) info.


## Run it

```bash
pnpm install
pnpm quick
```

## Customize
1. Customize your config in `/config/default.ts`
2. Update package.json with your own data
3. Look at you .env file to understand what is required and update accordingly 
4. There are many config files, which end with '-config.ts'. Here you can set for example your entity structure or your navigation structure.


## Cella CLI
Currently, Cella CLI is limited to creating a project (which you already used), listing diverged files and pulling upstream changes. Both commands will use your config in cella.config.js.

### 1. List diverged
Receive a list of files that have diverged from cella itself. The files you have ignored in cella.config.js will not be listed.

```bash
pnpm diverged
```

### 2. Pull upstream
Pull upstream changes from cella. Changes in files that are ignored will automatically be undone, to reduce conflicts.

```bash
pnpm run upstream:pull
```