---
syncBreaking: true
clientCacheBump: false
---

# rolldown builds the services; CI boots what it built

The backend, cdc and yjs bundles and infra's boot runner build with rolldown: each `tsup.config.ts` gives way to a
`rolldown.config.ts`, and `tsup` leaves the four workspaces. The sync carries the configs and the package.json entries
an app kept as upstream's. The app keeps its own on-disk packages in `appKeepOnDisk`, swaps the entries it changed
itself, and runs `pnpm install`. CI's build-services job now boots the bundles (`pnpm boot:check`).

## What & why

tsup is unmaintained, and rolldown already ships with Vite: 23 packages leave the lockfile and none arrive. Each config
sets `tsconfig: 'tsconfig.json'` and fails the build on an `UNRESOLVED_IMPORT`. The Dockerfile's builder stages copy the
root `tsconfig.json`. `keepOnDisk` returns `{ external }` only. `pnpm boot:check` runs each bundle as its image does,
from its `dist` beside only its `dependencies`.

## Blast radius

Every app: build scripts, devDependencies, configs and lockfile. An app that edited a tsup config gets a modify/delete
conflict. The worker bundles shrink (cdc −21%, yjs −13% gzipped); behaviour, externals and `/openapi.json` are unchanged.
No database, API or cache change.

## Run

No script: manual.

## Manual steps

1. A package an app's tsup config kept on disk itself (raak and projectcampus list `'@ngrok/ngrok'` in backend's) goes into `appKeepOnDisk` in `backend/src/bundle-config.ts`, if it is still in that service's `dependencies` after the sync.
2. Resolve a modify/delete conflict on a `tsup.config.ts` by deleting it, once step 1 holds what it added; other edits move into the matching `rolldown.config.ts`.
3. The package step swaps `build`, `build:dev`, `build:staging` (backend), `build` (cdc, yjs) and `boot:build` (infra) to rolldown, and `tsup` for `rolldown: ~1.2.14`, where the app kept upstream's entry. Swap any entry the app changed by hand; a `tsup` devDependency the sync kept because a tsup config still imports it goes with that config.
4. A Dockerfile the app changed keeps `COPY tsconfig.json ./` in its `backend-builder`, `cdc-builder` and `yjs-builder` stages: without the root tsconfig the build stops.
5. `pnpm boot:check` boots the services in development mode from `backend/.env.example`: an app whose services need more to start adds those values there.
6. Run `pnpm install`.

## Verify

```sh
pnpm install
pnpm build
pnpm boot:check
pnpm check
```
