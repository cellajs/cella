---
syncBreaking: true
clientCacheBump: false
---

# Dependency reduction: lefthook, workspace overrides, commit check, ngrok CLI, serwist

About 600 packages leave the lockfile and every service image installs 53 instead of 219. Most of it arrives with the
sync; the app finishes it in files the sync does not overwrite: `pnpm-workspace.yaml` (the `lefthook` `allowBuilds`
key, the esbuild override rewrite, new overrides and `ignoredOptionalDependencies`), the root `package.json`
(`lefthook`, commitlint out), the ngrok CLI for `pnpm tunnel`, and any app-specific PWA manifest values.

## What & why

react-scan's CLI linter stack, a second service-worker toolchain (vite-plugin-pwa and workbox), NodeSDK's gRPC
exporters and a dozen single-file libraries are gone, and service images no longer install sibling workspaces'
dependencies. Replacements: `@serwist/vite`, a tracer provider plus `shared/src/otel-log-transport.ts`,
`shared/scripts/check-commit-msg.ts`, `vite/index-html.ts`, `vite/sdk-static.ts`.

## Blast radius

Every app: the `allowBuilds` rename (installs fail without it) and the esbuild override (the next `pnpm cella audit`
drops the old key and adds 27 entries). Apps that import a removed package, customized the PWA manifest or use
`otel.sdk`. No database or API change.

## Run

No script: manual.

## Manual steps

1. `pnpm-workspace.yaml` `allowBuilds`: replace `'@evilmartians/lefthook': true` with `lefthook: true`, add `'@evilmartians/lefthook': false` (drop it once every checkout reinstalled), remove `core-js: false`.
2. `pnpm-workspace.yaml` overrides: replace `esbuild@<0.28.1: ^0.28.1` with `drizzle-kit>esbuild: ^0.28.1`; remove the `http-cache-semantics`, `joi`, `shell-quote` and `source-map-js` keys.
3. Same file, add overrides: `react-scan>react-doctor: '-'`, `oxc-resolver: 11.24.2`, `'@tailwindcss/node>lightningcss': ^1.33.0`, `'@opentelemetry/instrumentation-pg>@types/pg': '-'`, `'@opentelemetry/instrumentation-pg>@types/pg-pool': '-'`, `'@blocknote/shadcn>lucide-react': ^1.59.0` (copy the comments from cella's file).
4. Same file: add `ignoredOptionalDependencies: ['@napi-rs/canvas', canvg, core-js, html2canvas]` (raak's own `@napi-rs/canvas` dependency is unaffected); remove `peerDependencyRules` and `publicHoistPattern`.
5. Root `package.json`: `@evilmartians/lefthook` becomes `lefthook` (same version); remove `@commitlint/cli`, `@commitlint/config-conventional` and the `commitlint` block; `knip` `^6.42.1`. An app with its own commit types edits `commitTypes` in `shared/scripts/check-commit-msg.ts`.
6. `pnpm tunnel` runs the ngrok CLI: `brew install ngrok` (or https://ngrok.com/download). `TUNNEL_URL` and `TUNNEL_AUTH_TOKEN` stay.
7. PWA: manifest values an app set in `VitePWA({ manifest })` move to the `web-manifest` plugin in `frontend/vite.config.ts`; an edited `lib/sw.ts` reads `self.__SW_MANIFEST`; app code on `virtual:pwa-register/react` moves to `getSerwist` from `virtual:serwist`.
8. `index.html`: placeholders stay `<%= key %>`; a key of the app's own goes into `indexHtml({ ... })` in `frontend/vite.config.ts`. EJS logic (`<% if %>`) is not supported.
9. Server OTel: code reading `otel.sdk` reads `otel.tracerProvider`; a service with its own tsup config adds the entry `'otel-log-transport': '../shared/src/otel-log-transport.ts'`, or its logs do not reach the sink.
10. An app that converts BlockNote to HTML on the server adds `@blocknote/server-util` itself, and `jsdom` to `appKeepOnDisk` (`backend/src/bundle-config.ts`) and that service's `dependencies`.
11. App code importing a removed package declares it itself or uses the replacement: `use-debounce` → `~/hooks/use-debounce`, `react-use-downloader` → `~/hooks/use-downloader`, `@oslojs/encoding` → `#/utils/base32`, `enforce-unique` → `mockUniqueEnforcer`, `html-to-text` (the renderer's `plainText` option is gone).
12. Run `pnpm install`, then `pnpm dedupe --check`.

## Verify

```sh
pnpm install
pnpm audit
pnpm unused
pnpm test:storybook
pnpm build
pnpm check
```
