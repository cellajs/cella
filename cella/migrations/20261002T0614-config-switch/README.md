# Config switch: xEnabledBy replaces the serviceEnabled and strategyEnabled gates

## What & why

A route names the config switch it belongs to in `xEnabledBy`: `{ service }`, `{ strategy }` or
`{ strategy: 'oauth', provider }`. `createXRoute` checks it before `xGuard`, so it no longer sits among the
guards. The gates `serviceEnabled(...)` and `strategyEnabled(...)` and the type `StrategyGate` are removed.
The spec carries the switch as `x-enabled-by`. The docs list every switched route and mark it off according to the
docs page's own config; the dead `x-service` docs filter is gone. `isSwitchOn` and `ConfigSwitch` live in `shared`.

## Blast radius

Sync-breaking. An app's own routes that use either gate fail type-checking until edited. No database change and no
`clientCacheVersion` bump. The `x-guard` lists in the spec get shorter.

## Run

No script: manual.

## Manual steps

1. Each own route with `xGuard: [serviceEnabled(S), ...guards]`: replace it with `xEnabledBy: { service: S }` and `xGuard: [...guards]`. Put `xEnabledBy` before `xGuard`.
2. Each `strategyEnabled(M)`: replace it with `xEnabledBy: { strategy: M }`; `strategyEnabled({ oauth: P })` becomes `xEnabledBy: { strategy: 'oauth', provider: P }`.
3. A per-request `StrategyGate` function: call `assertSwitchOn(...)` (`#/middlewares/config-switch`) in the handler for the request that needs it.
4. Tests that read `serviceEnabled(...)` or `strategyEnabled(...)` from a route's `x-guard` read `x-enabled-by` instead.
5. To keep a switched route out of the docs as well, set `hidden: true` on its module or add `'internal'` to its `tags`.

## Verify

```sh
pnpm sdk
pnpm --filter backend exec vitest run tests/auth-strategies tests/security/route-guards.test.ts src/core/x-routes.test.ts
pnpm check
```
