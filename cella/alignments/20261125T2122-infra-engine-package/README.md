---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: ../lib/, ../compose/infrastructure, ../resources/stores/catalog, infra/caddy/Dockerfile, enabledServices, nodeargs
---

# The deploy engine ships in @cellajs/cli, and infra/ keeps only the app's part

Take `@cellajs/cli` `^0.9.0` in the root and in `infra/package.json`, and add `"infra": "workspace:*"` to the root devDependencies. Delete the engine folders from `infra/` and take the template's `infra/package.json`, `Pulumi.yaml` and `program.mjs`. In `infra/config/`, import the engine's helpers from `@cellajs/cli/infra` and name `.ts` in relative imports. Apply every environment before its next deploy.

## What & why

The infra engine (CLI, Pulumi program, deploy, agent, frontend proxy, engine image) moved into `@cellajs/cli`: an app takes a new engine as a version bump, never as a merge into engine files. `infra/` holds the registries, stack files, environment records, `compose.gen.yml` and the app's contract tests. The engine reads the registries as `infra/config/<file>` without tsx.

## Blast radius

Every app with an `infra/` workspace. The typecheck flags each config import of a removed engine module. An engine edit the app carried becomes a config field or a committed `pnpm patch @cellajs/cli`. The first deploy after the upgrade owes an apply. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Root `package.json`: `@cellajs/cli` to `^0.9.0`, and `"infra": "workspace:*"` in devDependencies.
2. `infra/`: delete `agent/`, `caddy/`, `cli/`, `compose/`, `lib/`, `resources/`, `tasks/`, `index.ts`, `pulumi-context.ts`, `Dockerfile`, `vitest.config.ts` and `tests/`, then take the template's `package.json`, `Pulumi.yaml` (it runs `program.mjs`, with no tsx), `program.mjs`, `vitest.config.ts` and `tests/`.
3. `infra/config/*.ts`: imports of `../lib/...`, `../compose/infrastructure` and `../resources/stores/catalog` come from `@cellajs/cli/infra`, and relative imports end in `.ts`.
4. `config/engine-config.ts` builds its value with `defineEngineConfig` and takes the `EngineConfig` type from `@cellajs/cli/infra`. Fields an app added to that interface stay on its own value; its config functions type them themselves.
5. `config/frontend-csp.config.ts` takes the enabled services from `appServices` of `./services.config.ts`, and `config/services.config.ts` names `frontendProxyDockerfile` for the `frontend` entry.
6. An engine file the app changed: turn the change into a config field (ask upstream), or commit it as `pnpm patch @cellajs/cli`.
7. `pnpm install`, then `pnpm --filter infra compose:generate`, and commit `infra/compose.gen.yml`.
8. `pnpm cella infra apply --mode <mode>` for every environment before its next deploy: the release check on the release PR says it is owed.

## Verify

`pnpm cella infra help`, `pnpm --filter infra test`, `APP_MODE=production pnpm --filter infra description-hash`, then `pnpm check`.
