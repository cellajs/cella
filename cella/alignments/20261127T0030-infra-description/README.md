---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: defineServices, defineRuntimeSecrets, defineGeneral, defineStores, defineManagedKeys, defineEnvSuppliers, defineEngineConfig, frontendProxyDockerfile, postgresManaged, '@cellajs/cli/infra', infra/config, bindings:, ${APP_ORIGIN}, compose.gen.yml, compose:generate, compose:check
---

# The app's infra config is one file, infra/description.yml

Take the template's `infra/description.yml` and carry into its six keys what the app's own `infra/config/` changed, with each service's `env` in the file's form. Move the app's CSP edits to `shared/src/config-builder/frontend-csp.ts`. Delete `infra/config/` and `infra/compose.gen.yml`, drop `"infra": "workspace:*"` from the root `package.json`, then apply every environment.

## What & why

The engine in `@cellajs/cli` reads one YAML file, `infra/description.yml`, and checks it at load. Each service states its port, internal port and path prefix, and once the mode's `appConfig` loads, the engine refuses one that differs from `appConfig.services`. The seven `infra/config/` modules, `infra/compose.gen.yml`, `compose:generate` and `compose:check` go, and `pnpm cella infra compose` prints the Compose file a deploy renders. A deployment's description is data, and the engine holds what it repeats of the shared config against it.

## Blast radius

Every app with an `infra/` workspace; one that never edited `infra/config/` takes the template's file unchanged. A store kind, or an env supplier no binding or literal replaces, has no place in the file: ask upstream for a field. Every environment owes one apply. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. An app that has not applied `20261125T2122-infra-engine-package` does both in this one upgrade: that alignment's steps 2 and 6, then the steps below, with one apply per environment for both.
2. Take the template's `infra/description.yml`. Its six keys hold what `infra/config/` held: `general` (`general.config.ts`), `processIdentityEnv` and `services` (`services.config.ts`), `runtimeSecrets` (`runtime-secrets.config.ts`), `stores` (`stores.config.ts`) and `managedKeys` (`managed-keys.config.ts`).
3. `services`: carry over the app's own services and machine types (`instanceType`). An entry states no `image`, which the engine derives from its slug or `reusesImageOf`, and the proxy's `dockerfile` is `engine:proxy`.
4. Each service states its `port`, the backend its `internalPort`, and a service with `lbRoute: path` its `pathPrefix`, each equal to `appConfig.services` of `shared`. The `frontend` proxy states its container's port, 80.
5. A service's `env` holds each value itself, and the file has no `bindings` key: a `bindings` entry moves into `env` as `NAME: '<its template with @{...}>'`, replacing the `'${NAME}'` placeholder. The engine refuses a `$` in an `env` or `release.env` value at load.
6. `APP_ORIGIN: '${APP_ORIGIN}'` becomes `APP_ORIGIN: '@{frontend.url}'`. The proxy's env leaves out `FRONTEND_CSP`, `FRONTEND_EMBED_CSP`, `FRONTEND_PERMISSIONS_POLICY` and `ORIGIN_HOST`, which the engine supplies.
7. A value of the app's own `defineEnvSuppliers` becomes a binding (`@{<slug>.url}`, `.port`, `.internalHost` or `.internalPort`) when it is a service's URL, port or internal address, and a literal when it is fixed. Any other is a field to ask of the template; until it ships, a committed `pnpm patch @cellajs/cli` supplies the value.
8. `runtimeSecrets`: key each runtime secret by its variable: `generation: random` where the engine makes it, `derivedFrom: { secret, with: '<path>#<export>' }` where it follows another, neither where an operator sets it. A reference's path runs from the app root to a file under `shared/` or `infra/`.
9. State `secretName` on every secret with `generation: random`, and on any other whose old stored name differs from its variable in kebab-case. A stored name never changes, and a stated one never follows a renamed variable by accident.
10. `stores`: a service of the app's own that reads the database joins `runtime` and `ca` of `stores.primary.secretConsumers`, as `yjs` does, or its env schema refuses to boot without the connection string.
11. An app that changed `managedKeys`, `general` or `processIdentityEnv` carries its values over. A managed key's `assign` names variables (`SCW_AI_API_KEY`) where the old config named ids.
12. Move the app's edits of `infra/config/frontend-csp.config.ts` to `shared/src/config-builder/frontend-csp.ts`; the `frontend` service's `headers` names its `frontendHeaders`.
13. Delete `infra/config/` and `infra/compose.gen.yml`, and take the template's `infra/package.json`, which has no `compose:generate` or `compose:check`, and CI's workflow without its compose step.
14. The app's own `cella/cella.config.ts`: drop `'infra/compose.gen.yml'` from `ignored`.
15. Take the template's `infra/tests/`. `@cellajs/cli/infra` no longer exists: an app test of its own imports from `@cellajs/cli/infra/contract`, which exports `appServices`, `runtimeSecrets`, `runtimeSecretConsumers`, `runtimeSecretsForConsumer`, `documentedTasks`, the operator action helpers (`operatorActions`, `isOperatorActionId`, `actionLabel`, `menuRow`, `menuRows`), `redirectedApexOrigin` and `engineAssetsDir`.
16. Root `package.json`: drop `"infra": "workspace:*"`, take the `@cellajs/cli` version this alignment's template release pins, then `pnpm install`. An app image that copies `infra/package.json` drops that `COPY`.
17. `pnpm cella infra apply --mode <mode>` for every environment before its next deploy, since the description hash changes.

## Verify

`pnpm cella infra compose` renders the Compose file, `pnpm cella infra description --mode production` prints what the engine reads of the app, `pnpm --filter infra test` passes, then `pnpm check`. By hand: each apply's plan replaces no resource, renames no secret container and deletes no service or secret the app still runs. A rename is a secret whose `secretName` step 9 missed, and a delete is a service, a secret or a store consumer steps 3, 8 and 10 left out.
