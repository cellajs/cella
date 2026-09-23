# Node.js 26 is the required runtime

## What & why

Every `engines.node` moves from `24.x` to `26.x`. CI (`node-version`, `NODE_VERSION`), `Dockerfile`
and `infra/boot/Dockerfile` (`node:26-*`), the `boot:build` target (`node26`) and `@types/node`
follow. `frontend/vitest.setup.ts` deletes Node's global `localStorage` in node-env tests: Node 25+
defines it as `undefined` without `--localstorage-file`, so zustand `persist` crashes on write where
it used to disable itself.

## Blast radius

Every app, on every machine: local development, CI and images all need Node 26. Not sync-breaking,
no DB or cache change. Synced files arrive migrated; only app-owned workflows, Dockerfiles, Node
version pins and vitest setup files need the manual steps.

## Run

No script: manual.

## Manual steps

1. Install Node 26 locally (`volta install node@26`, `nvm install 26`, or the installer), then `pnpm install`.
2. App-owned workflows under `.github/workflows/`: set `node-version` / `NODE_VERSION` to `26`.
3. App-owned Dockerfiles or version pins (`.nvmrc`, `volta` key, hosting settings): move `node:24-*` and `24` to `26`.
   Node 25+ no longer ships corepack, so `RUN corepack enable` fails with exit code 127 on `node:26-*`. Install
   pnpm from npm at the `packageManager` pin instead, as the base stage of the synced `Dockerfile` does.
4. App-owned packages: set `engines.node` to `26.x` and `@types/node` to the version the synced packages pin.
5. App-owned vitest setup files that run node-env tests against a store persisting to `localStorage`: copy the guard from `frontend/vitest.setup.ts`.

## Verify

```sh
node -v   # v26.x
git grep -n -E "node-version: 24|NODE_VERSION: '24'|node:24-|\"node\": \"24" -- . ':!pnpm-lock.yaml'   # expect no output
git grep -n corepack -- '*Dockerfile*'   # expect no output: images install pnpm from npm, not via corepack
pnpm check
pnpm test:core
```
