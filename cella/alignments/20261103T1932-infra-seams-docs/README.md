---
breaking: false
clientCacheBump: false
grep: loadEngineConfig, setEngineConfig, INFRA_CONFIG_MODULE, PulumiDriver, createPulumiDriver, PerMode, resolvePerMode, machineImage, config/sizing, STATUS_SCHEMA_VERSION, CredentialTier, stopGracePeriod
---

# The deploy engine drops what no app used

Nothing to change in an app whose `infra/` matches the template, as every app's does: the upgrade brings the new files, and `pnpm check` confirms that no module of the app's own imports what went. A script that reads `pnpm infra status --json` finds a check's key tier under `key` and no `schemaVersion`. The next apply in each environment updates the main job's description in place.

## What & why

The engine keeps what the apps use. `config/engine-config.ts` exports `engineConfig`, built from `appConfig`; `loadEngineConfig`, `setEngineConfig` and `INFRA_CONFIG_MODULE` are gone. So are `PulumiDriver`, `PerMode`, `resolvePerMode`, `machineImage`, `config/sizing.ts`, `lbRoute: 'host'`, `stopGracePeriod`, a release step's `command` and the `always` and `on-failure` restart values. Deploy telemetry ignores `OTEL_EXPORTER_OTLP_*`. The status report drops `schemaVersion` and renames a check's `credential` to `key`.

## Blast radius

Not breaking: every app's `infra/` is the template's, so the upgrade replaces it whole, and a module of the app's own that imports a removed name fails typecheck. The applied description's hash is unchanged. The privileged check names the main job, whose description changes. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. A module of the app's own that called `loadEngineConfig()` sets `APP_MODE` first, then imports `engineConfig` from `infra/config/engine-config.ts`; a test that called `setEngineConfig` mocks that module.
2. A per-mode map in the app's `infra/config/general.config.ts` becomes one value; a service's `instanceType` keeps its map.
3. A script that parses `pnpm infra status --json` reads `key` where it read `credential`, and drops its `schemaVersion` check.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```
