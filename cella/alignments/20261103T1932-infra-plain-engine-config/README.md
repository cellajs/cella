---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: loadEngineConfig, setEngineConfig, INFRA_CONFIG_MODULE, PulumiDriver, createPulumiDriver, machineImage, config/sizing, STATUS_SCHEMA_VERSION, CredentialTier, stopGracePeriod, frontendCsp
---

# The deploy engine reads a plain config and drops unused options

An app whose `infra/` matches the template, as every app's does, has nothing to change: the typecheck names any module of its own that still uses what went. A script that parses `pnpm infra status --json` reads a check's key tier from `key` and finds no `schemaVersion`, which nothing catches. The next apply in each environment updates the main job's description in place.

## What & why

The engine keeps what the apps use. `config/engine-config.ts` exports `engineConfig`, built from `appConfig`; `loadEngineConfig`, `setEngineConfig` and `INFRA_CONFIG_MODULE` are gone. So are `PulumiDriver`, `machineImage`, `config/sizing.ts`, `lbRoute: 'host'`, `stopGracePeriod`, a release step's `command` and the `always` and `on-failure` restart values. `frontendCsp` takes the config. Deploy telemetry ignores `OTEL_EXPORTER_OTLP_*`. The status report drops `schemaVersion` and renames a check's `credential` to `key`.

## Blast radius

Breaking only for an app's own code: every app's `infra/` is the template's, so the upgrade replaces it whole. The typecheck flags a module of the app's using a removed name; nothing catches a script parsing the status JSON. The description hash is unchanged. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. A module of the app's own that called `loadEngineConfig()` sets `APP_MODE` first, then imports `engineConfig` from `infra/config/engine-config.ts` dynamically; a test that called `setEngineConfig` mocks that module.
2. A per-mode map for `compute.image` in the app's `infra/config/general.config.ts` becomes one value; the database fields, the asset retention and a service's `instanceType` keep theirs.
3. A module that read `frontendCsp` calls it with the engine config, and an `EnvSupplierContext` it builds carries `config`.
4. A service an `lbRoute: 'host'` served takes `lbRoute: 'path'` and a URL under the app origin: `pnpm infra` refuses a routed service on another host.
5. A script that parses `pnpm infra status --json` reads `key` where it read `credential`, and drops its `schemaVersion` check.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```
