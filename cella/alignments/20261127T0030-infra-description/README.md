---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: defineServices, defineRuntimeSecrets, defineGeneral, defineStores, defineManagedKeys, defineEnvSuppliers, defineEngineConfig, frontendProxyDockerfile, postgresManaged, compose.gen.yml, compose:generate, compose:check
---

# The app's infra config is one file, infra/description.yml

Take the template's `infra/description.yml` and carry into it what the app's own `infra/config/` changed: its services, runtime secrets, machine types and database size. Move the app's CSP edits to `shared/src/config-builder/frontend-csp.ts`. Delete `infra/config/` and `infra/compose.gen.yml`, drop `"infra": "workspace:*"` from the root `package.json`, then apply every environment.

## What & why

The engine in `@cellajs/cli` reads one YAML file, `infra/description.yml`, and checks it at load. Each service states its port, internal port and path prefix, and once the mode's `appConfig` loads, the engine refuses one that differs from `appConfig.services`. The seven `infra/config/` modules, `infra/compose.gen.yml`, `compose:generate` and `compose:check` go, and `pnpm cella infra compose` prints the Compose file a deploy renders. A deployment's description is data, and the engine holds what it repeats of the shared config against it.

## Blast radius

Every app with an `infra/` workspace; one that never edited `infra/config/` takes the template's file unchanged. A store kind or env supplier the app passed as code has no place in the file: ask upstream for an engine field. Every environment owes one apply. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. An app that has not applied `20261125T2122-infra-engine-package` does both in this one upgrade: that alignment's steps 2 and 6, then the steps below, with one apply per environment for both.
2. Take the template's `infra/description.yml`.
3. Carry over from the old `infra/config/` the app's own services (`services`), runtime secrets (`runtimeSecrets`), machine types (`instanceType`) and database size (`general.database`).
4. Key each runtime secret by its variable: `generation: random` where the engine makes it, `derivedFrom: { secret, with: '<path>#<export>' }` where it follows another, neither where an operator sets it. A reference's path runs from the app root to a file under `shared/` or `infra/`.
5. State `secretName` on every secret with `generation: random`, and on any other whose old stored name differs from its variable in kebab-case. A stored name never changes, and a stated one never follows a renamed variable by accident.
6. Each service states its `port`, the backend its `internalPort`, and a service with `lbRoute: path` its `pathPrefix`, each equal to `appConfig.services` of `shared`. The `frontend` proxy states its container's port, 80.
7. Move the app's edits of `infra/config/frontend-csp.config.ts` to `shared/src/config-builder/frontend-csp.ts`; the `frontend` service's `headers` names its `frontendHeaders`.
8. Delete `infra/config/` and `infra/compose.gen.yml`, and take the template's `infra/package.json`, which has no `compose:generate` or `compose:check`, and CI's workflow without its compose step. Take the template's `infra/tests/` too: an app test of its own that imports `infra/config/` reads the same registries from `@cellajs/cli/infra/contract`.
9. Root `package.json`: drop `"infra": "workspace:*"`, take the template's `@cellajs/cli` version, then `pnpm install`. An app image that copies `infra/package.json` drops that `COPY`.
10. `pnpm cella infra apply --mode <mode>` for every environment before its next deploy, since the description hash changes.

## Verify

`pnpm cella infra compose` renders the Compose file, `pnpm cella infra description --mode production` prints what the engine reads of the app, `pnpm --filter infra test` passes, then `pnpm check`. By hand: each apply's plan replaces no resource and renames no secret container. A renamed one is a secret whose `secretName` step 5 missed.
