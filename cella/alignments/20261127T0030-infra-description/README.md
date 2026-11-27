---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: defineServices, defineRuntimeSecrets, defineGeneral, defineStores, defineManagedKeys, defineEnvSuppliers, defineEngineConfig, frontendProxyDockerfile, postgresManaged, '@cellajs/cli/infra', infra/config, bindings:, ${APP_ORIGIN}, compose.gen.yml, compose:generate, compose:check, filter infra, `infra/, 'infra/, "infra/, (infra/, 'infra', "infra":, infra/tests, infra/package.json, cd infra, working-directory: infra, -p cella --pretty
---

# The app's infra is one file, cella/infra/description.yml, and the infra workspace goes

Take the template's `cella/infra/description.yml` and carry into its six keys what the app's own `infra/config/` changed, with each service's `env` in the file's form. Move the app's CSP edits to `shared/src/config-builder/frontend-csp.ts`. Move `infra/environments` and the stack files to `cella/infra/` and the app's own tests to `cella/tests/`, then delete `infra/` with its `package.json`. A new `cella/package.json` makes `cella/` the workspace package `cella-tools`, which holds the engine's packages, each engine task runs as `pnpm cella infra <task>`, every operator moves their `infra/.env.<mode>` files to `cella/infra/`, and every environment owes an apply.

## What & why

The engine in `@cellajs/cli` reads one YAML file, `cella/infra/description.yml`, and checks it at load: it refuses a service port that differs from `appConfig.services`. The `infra/config/` modules, `infra/compose.gen.yml`, `compose:generate` and `compose:check` go; `pnpm cella infra compose` prints the Compose file a deploy renders. The `infra` workspace goes too: the app's part sits under `cella/` beside its other CLI files, in the package `cella-tools`, where Pulumi resolves its packages.

## Blast radius

Every app with an `infra/` workspace. One that never edited `infra/config/` takes the template's description unchanged. A store kind, or an env supplier no binding or literal replaces, has no place in the file: ask upstream for a field. Operators move their key files, and every environment owes one apply.

## Run

No script: manual.

## Manual steps

1. An app that has not applied `20261125T2122-infra-engine-package` does both in this one upgrade: that alignment's step 2 (its deletes only) and step 6, then the steps below, with one apply per environment for both.
2. `git mv infra/environments cella/infra/environments`, and the same for each `infra/Pulumi.<mode>.yaml`, over any template copy the upgrade brought: both are the app's.
3. The app's own `cella/cella.config.ts`: `ignored` names `cella/infra/environments` and each `cella/infra/Pulumi.<mode>.yaml` in place of the `infra/` paths, and drops `'infra/compose.gen.yml'`.
4. `cella/infra/Pulumi.yaml`, `cella/infra/program.mjs` and `cella/infra/README.md` are the template's. The Pulumi project `name` stays `infra`: the state is keyed by it.
5. Take the template's `cella/infra/description.yml`. Its six keys hold what `infra/config/` held: `general` (`general.config.ts`), `processIdentityEnv` and `services` (`services.config.ts`), `runtimeSecrets` (`runtime-secrets.config.ts`), `stores` (`stores.config.ts`) and `managedKeys` (`managed-keys.config.ts`).
6. `services`: carry over the app's own services and machine types (`instanceType`). An entry states no `image`, which the engine derives from its slug or `reusesImageOf`, and the proxy's `dockerfile` is `engine:proxy`.
7. Each service states its `port`, the backend its `internalPort`, and a service with `lbRoute: path` its `pathPrefix`, each equal to `appConfig.services` of `shared`. The `frontend` proxy states its container's port, 80.
8. A service's `env` holds each value itself, and the file has no `bindings` key: a `bindings` entry moves into `env` as `NAME: '<its template with @{...}>'`, replacing the `'${NAME}'` placeholder. The engine refuses a `$` in an `env` or `release.env` value at load.
9. `APP_ORIGIN: '${APP_ORIGIN}'` becomes `APP_ORIGIN: '@{frontend.url}'`. The proxy's env leaves out `FRONTEND_CSP`, `FRONTEND_EMBED_CSP`, `FRONTEND_PERMISSIONS_POLICY` and `ORIGIN_HOST`, which the engine supplies.
10. A value of the app's own `defineEnvSuppliers` becomes a binding (`@{<slug>.url}`, `.port`, `.internalHost` or `.internalPort`) when it is a service's URL, port or internal address, and a literal when it is fixed. Any other is a field to ask of the template; until it ships, a committed `pnpm patch @cellajs/cli` supplies the value.
11. `runtimeSecrets`: key each runtime secret by its variable: `generation: random` where the engine makes it, `derivedFrom: { secret, with: '<path>#<export>' }` where it follows another, neither where an operator sets it. A reference's path runs from the app root to a file under `shared/` or `cella/infra/`.
12. State `secretName` on every secret with `generation: random`, and on any other whose old stored name differs from its variable in kebab-case. A stored name never changes, and a stated one never follows a renamed variable by accident.
13. `stores`: a service of the app's own that reads the database joins `runtime` and `ca` of `stores.primary.secretConsumers`, as `yjs` does, or its env schema refuses to boot without the connection string.
14. An app that changed `managedKeys`, `general` or `processIdentityEnv` carries its values over. A managed key's `assign` names variables (`SCW_AI_API_KEY`) where the old config named ids.
15. Move the app's edits of `infra/config/frontend-csp.config.ts` to `shared/src/config-builder/frontend-csp.ts`; the `frontend` service's `headers` names its `frontendHeaders`.
16. The template's tests arrive in `cella/tests/`, run by `cella/vitest.config.ts`. `git mv` each test of the app's own from `infra/tests/` to `cella/tests/`: a path from the repo root stays `../..`.
17. `@cellajs/cli/infra` no longer exists: an app test imports from `@cellajs/cli/infra/contract`, which exports `appServices`, `runtimeSecrets`, `runtimeSecretConsumers`, `runtimeSecretsForConsumer`, `documentedTasks`, the operator action helpers (`operatorActions`, `isOperatorActionId`, `actionLabel`, `menuRow`, `menuRows`), `redirectedApexOrigin` and `engineAssetsDir`.
18. Delete `infra/` whole once the steps above moved what stays: `config/`, `compose.gen.yml`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `tests/` and `node_modules/`. `git ls-files infra` then prints nothing.
19. Create `cella/package.json` (an upgrade never brings a `package.json`): `"name": "cella-tools"`, `"private": true`, `"type": "module"`, scripts `"test": "cd .. && vitest run --root cella"` and `"ts": "cd .. && tsgo -p cella/tsconfig.json --pretty"`.
20. Its `dependencies`: `@cellajs/cli` (the version this alignment's template release pins), `@pulumi/pulumi`, `@pulumiverse/scaleway`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` and `"shared": "workspace:*"`, plus any package the app added to `infra/package.json`; its `devDependencies`: `@types/node`, `@typescript/native-preview` and `vitest`, at the versions the other packages pin.
21. Root `package.json`: drop `"infra": "workspace:*"` and `@typescript/native-preview`, and drop `&& tsgo -p cella --pretty` from the `ts` and `check` scripts. The root keeps `@cellajs/cli` as its one engine package, a dev dependency for `pnpm cella`.
22. `pnpm-workspace.yaml`: `infra` leaves `packages` and `cella` joins it, then `pnpm install`. An app image that copies `infra/package.json` drops that `COPY`.
23. An app that changed the root `vitest.config.ts` or `cella/tsconfig.json` keeps the template's `'cella'` project and its `tests/**/*.ts` include, which `pnpm ts` typechecks.
24. The app's own workflows and scripts: `pnpm --filter infra <task>` becomes `pnpm cella infra <task>` with the same task, `pnpm --filter infra test` becomes `pnpm --filter cella-tools test`, and an install's `--filter infra...` becomes `--filter cella-tools...`.
25. Paths in the app's own files (`.gitignore`, `biome.jsonc`, `knip.jsonc`, docs, comments): `infra/description.yml`, `infra/environments`, `infra/Pulumi.*`, `infra/.debug/` and `infra/.state-backups/` move under `cella/infra/`, and `infra/tests/` becomes `cella/tests/`.
26. Every operator, in every checkout: `mv infra/.env.<mode> cella/infra/.env.<mode>` for each mode. The engine refuses to start while one is left behind.
27. Every operator who keeps them: `mv infra/.debug cella/infra/.debug` and `mv infra/.state-backups cella/infra/.state-backups`.
28. `pnpm cella infra apply --mode <mode>` for every environment before its next deploy, since the description hash changes.

## Verify

`git ls-files infra` prints nothing, `pnpm cella infra compose` renders the Compose file, `pnpm cella infra description --mode production` prints what the engine reads of the app, `pnpm --filter cella-tools test` passes, then `pnpm check`. By hand: each apply's plan replaces no resource, renames no secret container and deletes no service or secret the app still runs. A rename is a secret whose `secretName` step 12 missed, and a delete is a service, a secret or a store consumer steps 6, 11 and 13 left out.
