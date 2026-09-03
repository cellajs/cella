# Explicit .ts import extensions in the Vite config-load graph

## What & why

Vite 8's planned-default `configLoader: 'native'` needs fully-specified ESM imports, and
`frontend/vite.config.ts` loads the whole `shared/` graph at config time. All relative imports in
`shared/` and `frontend/vite/` now carry `.ts` extensions, directory-index imports name the index
file (`'../shared/index.ts'`, `'./src/permissions/index.ts'`), `__dirname` became
`import.meta.dirname` in `frontend/vite.config.ts` and the `frontend/vite/` tests,
`allowImportingTsExtensions` moved to the root `tsconfig.json`, and a `biome.jsonc` override
enforces `correctness/useImportExtensions` over `shared/**`, `frontend/vite/**` and
`frontend/vite.config.ts`.

## Blast radius

Not sync-breaking: no wire change, no `clientCacheVersion` bump, no DB. Forks that customized
`shared/` or `frontend/vite/` see conflicts (~90 template files; take upstream, re-run the fixer)
and app-owned files there fail lint until the codemod runs; untouched directories merge clean.

## Run

```sh
pnpm biome lint --only=correctness/useImportExtensions --write --unsafe shared frontend/vite frontend/vite.config.ts   # apply
pnpm lint:fix                                                                                                          # normalize
```

## Manual steps

1. If you customized `frontend/vite.config.ts`, replace remaining `__dirname` with
   `import.meta.dirname` and keep the `'../shared/index.ts'` import fully specified.
2. If an app tsconfig does not extend the root `tsconfig.json` but type-checks `shared/` source,
   add `"allowImportingTsExtensions": true` (requires `noEmit`).
3. Fix directory-index imports the fixer flags but cannot resolve.

## Verify

```sh
pnpm ts
cd frontend && pnpm exec vite --configLoader native   # must load under the future default (Node >= 22.18)
pnpm check
```
