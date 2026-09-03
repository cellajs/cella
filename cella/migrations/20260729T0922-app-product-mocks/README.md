# Rename the app product mock registry

## What & why

The app-owned product mock registry uses app vocabulary in its filename and export: the shared
registry imports `appProductMocks` from `backend/src/mocks/app-product-mocks.ts`.

## Blast radius

Sync-breaking for apps that customized the previous pinned mock registry. No wire-shape,
client-cache, or database change.

## Run

No script, manual.

## Manual steps

1. Rename `backend/src/mocks/fork-product-mocks.ts` to `backend/src/mocks/app-product-mocks.ts`.
2. Rename the `forkProductMocks` export to `appProductMocks` and update imports.
3. Update the pinned path in `cella.config.ts`.

## Verify

```sh
pnpm check
```
