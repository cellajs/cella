# Explicit .ts import extensions in the Vite config-load graph

## What & why

Vite 8 prints a ~150-line warning on every `pnpm dev`: the frontend config uses features
unsupported by `configLoader: 'native'`, which is planned to become the default in a future
Vite major. `frontend/vite.config.ts` imports `appConfig` from `shared`, so the entire
`shared/` module graph is loaded at config time; the native loader (Node's built-in type
stripping) requires fully-specified ESM imports, so extensionless relative imports become a
hard break when the default flips. Upstream now: all relative imports in `shared/` and
`frontend/vite/` carry explicit `.ts` extensions (~260 rewrites), directory-index imports
name the index file (`'../shared/index.ts'`, `'./src/permissions/index.ts'`), `__dirname`
became `import.meta.dirname` in `frontend/vite.config.ts` and the `frontend/vite/` tests,
`allowImportingTsExtensions` moved to the root `tsconfig.json`, and a `biome.jsonc` override
enforces `correctness/useImportExtensions` over `shared/**`, `frontend/vite/**`, and
`frontend/vite.config.ts` (now also in Biome's `files.includes`).

## Blast radius

Not sync-breaking: no wire-shape change, no `clientCacheVersion` bump, no database change.
The cost is merge surface — ~90 template-owned files change, so forks that customized
`shared/` or `frontend/vite/` will see conflicts (take upstream, then re-run the fixer).
After syncing, app-owned files inside those territories fail lint on extensionless relative
imports until the codemod below runs. Apps that never touched those directories merge clean
and need nothing beyond the sync itself.

## Run

The codemod is Biome's own fixer, driven by the synced `biome.jsonc` override. From the
repo root:

```sh
pnpm biome lint --only=correctness/useImportExtensions --write --unsafe shared frontend/vite frontend/vite.config.ts   # apply
pnpm lint:fix                                                                                                          # normalize
```

## Manual steps

1. If you customized `frontend/vite.config.ts`, replace any remaining `__dirname` with
   `import.meta.dirname` and keep the `'../shared/index.ts'` import fully specified.
2. If a tsconfig in your app does not extend the root `tsconfig.json` but type-checks
   `shared/` source, add `"allowImportingTsExtensions": true` to it (requires `noEmit`).
3. Fix any directory-index imports the fixer flags but cannot resolve (rare; it rewrites
   `'./dir'` to `'./dir/index.ts'` when the index file exists).

## Verify

```sh
pnpm ts
cd frontend && pnpm exec vite --configLoader native   # config must load under the future default (Node >= 22.18)
pnpm check
```
