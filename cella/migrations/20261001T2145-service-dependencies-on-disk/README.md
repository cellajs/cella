---
syncBreaking: true
clientCacheBump: false
---

# Service dependencies are what the bundle loads from disk

keepOnDisk takes the service's dependencies and throws on one the bundle inlines: a service image
installs only dependencies (pnpm install --prod), so dependencies lists what the bundle loads from
disk and every inlined package is a devDependency. jose, oidc-provider and web-push move to backend
devDependencies; backend drops pg-logical-replication, @blocknote/server-util and react-dom, yjs
drops @blocknote/core and frontend drops dexie-react-hooks. knip.json becomes knip.jsonc and pnpm
deps:unused runs knip --dependencies. Apps move each package pnpm build names to devDependencies, or
into appKeepOnDisk when it must load from disk.

## What & why

`keepOnDisk` (`shared/src/keep-on-disk.ts`) takes the service's `dependencies` as a second argument and throws when one of them is a package the bundle inlines. A service image installs only `dependencies` (`pnpm install --prod`), so an inlined package listed there is installed and never loaded. `jose`, `oidc-provider` and `web-push` move to backend devDependencies, and `knip.json` becomes `knip.jsonc`.

## Blast radius

Apps whose backend, cdc or yjs `dependencies` list a package the bundle inlines: `pnpm build` names each one. Apps that take upstream's `package.json` files and tsup configs are unaffected. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. In a tsup config the app changed, pass `pkg.dependencies` (`import pkg from './package.json' with { type: 'json' }`) as the second `keepOnDisk` argument.
2. Move each package `pnpm build` names to devDependencies, or add it to `appKeepOnDisk` in `backend/src/bundle-config.ts` when it must load from disk (a native addon).
3. Delete a leftover `knip.json`: knip reads it before `knip.jsonc`.

## Verify

```sh
pnpm install
pnpm --filter backend --filter cdc-worker --filter yjs-worker build
pnpm deps:unused
pnpm check
```
