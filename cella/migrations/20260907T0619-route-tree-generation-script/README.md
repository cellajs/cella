# Route tree generation script

## What & why

`pnpm generate:routes` (root) and `pnpm gen:routes` (frontend) regenerate `frontend/src/routes/routeTree.gen.ts` through `frontend/vite/generate-routes.ts`, which runs `@tanstack/router-generator` on the options in `frontend/vite/router-options.ts`, the same object `vite.config.ts` hands the router plugin. The generated tree is app-owned and never syncs, so a sync that adds a route file fails typecheck until Vite runs; the script closes that gap without a build or dev server.

## Blast radius

Every app: `package.json` files never sync, so the scripts and the dev dependency are added by hand. Not sync-breaking; no database or cache impact.

## Run

No script: manual.

## Manual steps

1. `frontend/package.json`: add `"gen:routes": "tsx vite/generate-routes.ts"` to `scripts` and `"@tanstack/router-generator"` to `devDependencies` at the version `pnpm why @tanstack/router-generator` reports, then `pnpm install`.
2. Root `package.json`: add `"generate:routes": "pnpm --filter frontend gen:routes"`.
3. If `vite.config.ts` still inlines the `tanstackRouter({...})` options, replace them with `tanstackRouter(routerOptions)` imported from `./vite/router-options.ts` and move any app-specific option into that file.

## Verify

```sh
pnpm generate:routes && git status --short frontend/src/routes/routeTree.gen.ts   # no diff on a tree Vite already generated
pnpm check
```
