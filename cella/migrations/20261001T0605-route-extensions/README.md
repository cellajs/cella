# Route extensions: gates in xGuard, xTool runs the route, revokeSessions

## What & why

Route extension props shrink to four: `xGuard`, `xRateLimiter`, `xCache`, `xTool`. `'x-service'` and
`'x-strategy'` are gone: their checks are gates leading `xGuard` (`serviceEnabled(service)`,
`strategyEnabled(method)`). `'x-tool'` is `xTool: { description, approvalRequired, entity }`, without `enabled`,
`category` and `execute`: an MCP tool call runs the route's own handler through the app. `endSessions`
(`helpers/end-sessions.ts`) is `revokeSessions` (`helpers/revoke-sessions.ts`).

## Blast radius

Template routes arrive by sync. An app's own routes using `'x-strategy'`, `'x-service'` or `'x-tool'`, and own code
calling `endSessions`, fail type-checking until edited. No database change, no `clientCacheVersion` bump; the spec's
`x-guard` lists gain the gates.

## Run

No script: manual.

## Manual steps

1. Each own route with `'x-strategy': X`: drop the prop and lead `xGuard` with `strategyEnabled(X)`; drop `'x-strategy': null` outright.
2. Each own route with `'x-service': S`: drop the prop and lead `xGuard` with `serviceEnabled(S)`.
3. Each `'x-tool'`: rename to `xTool`, keep `description`, `approvalRequired` and `entity`, place it after `xCache`; logic an `execute` added beyond its handler moves into the handler.
4. Rename `endSessions` / `EndSessionsOpts` / `helpers/end-sessions` to `revokeSessions` / `RevokeSessionsOpts` / `helpers/revoke-sessions`.
5. Tests asserting `'x-strategy'` or `'x-service'` on a route read its `x-guard` list (`strategyEnabled(<method>)`, `serviceEnabled(<service>)`).

## Verify

```sh
pnpm sdk
pnpm --filter backend exec vitest run src/modules/mcp tests/mcp.test.ts tests/auth-strategies
pnpm check
```
