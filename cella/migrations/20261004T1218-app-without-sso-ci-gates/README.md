---
syncBreaking: true
clientCacheBump: false
---

# An app without SSO needs no workarounds; CI checks open lint fixes and dependencies

An app that declares no federation and leaves `sso` out of `enabledAuthStrategies` now typechecks and passes the SSO
suites as it is: remove the workarounds. The synced CI lint job gained two checks an app's own code has to pass:
`pnpm biome check --write --unsafe` leaves no diff, and `pnpm deps:unused` exits 0. The dropdowner's `create` takes an
`onClose`.

## What & why

`appConfig.enabledAuthStrategies.includes('sso')` did not compile against a tuple without `sso`: code now asks
`isStrategyEnabled(strategy)` from `shared`. `session-tile.tsx` accepts `federations` typed
`Record<string, FederationConfig>`, and the backend test setup adds a `surfconext` federation when the app declares
none. Main also carried two files `pnpm lint:fix` rewrote in every app after a sync; CI now refuses that state.

## Blast radius

Sync-breaking through CI only: a branch with an open Biome fix or a knip finding fails the lint job. An app that uses
SSO changes nothing else. The `Typecheck as a new app` step passes in an app without doing anything. No database
change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Declare no federation as `federations: {} as Record<string, FederationConfig>` in `shared/config/config.default.ts`. The `satisfies` form types the keys as `never`, which the SSO code refuses.
2. Remove what worked around the opt-out: a widened `enabledAuthStrategies` type, a `// fork:` line in `frontend/src/modules/me/session-tile.tsx`, a test-only `surfconext` entry in `shared/config/config.test.ts`.
3. In app code, replace `appConfig.enabledAuthStrategies.includes(x)` and casts of it to `readonly string[]` with `isStrategyEnabled(x)` from `shared`.
4. Run `pnpm check` and `pnpm deps:unused`, and commit what they change or fix what they report. A binary or a package resolved by name goes in `knip.jsonc`.
5. Optional, for a menu that warms a description editor (note `20261002T0831-description-sync` step 11): pass `onClose: () => cool('menu')` in the data of `useDropdowner.getState().create`.

## Verify

```sh
pnpm check
pnpm deps:unused
pnpm --filter backend test
```
