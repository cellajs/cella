---
syncBreaking: true
clientCacheBump: false
---

# Module patterns an app could miss now fail a gate, and the replay flag sets itself

An `xTool` route behind `userGuard` fails at load, a file under a module's `helpers/` that reaches the database fails
Biome, `useRouteContext()` without `select` and `active:translate-y-0` on a `Button` fail `pnpm style`, and
`services.mcp` without `services.oauth` fails the config in every mode. `withReplayFlag` is removed: the query client
flags the stx of a mutation that pauses. The pinned `attachment-placement.ts` moves to the module root and
`finish-sign-in.ts` to `auth/general/operations/`.

## What & why

Each is a pattern the template's own modules follow and an app's modules could miss with every check green.
`createXRoute` refuses a tool route whose guards take no access token: an MCP call carries nothing else.
`flagPausedMutations` (`frontend/src/query/query-client.ts`) sets `stx.replayed` on the variables of a mutation that
pauses, so no `mutationFn` sets it. Biome restricts what `backend/src/modules/**/helpers/**` imports.

## Blast radius

Sync-breaking for an app with its own product modules: each gate names the file to change. An app with the template's
modules only moves its pinned `attachment-placement.ts`. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `git mv -f backend/src/modules/attachment/helpers/attachment-placement.ts backend/src/modules/attachment/attachment-placement.ts`, which puts the app's copy over the one the sync brought, and name the new path under `pinned` in `cella/cella.config.ts`.
2. A route that carries `xTool`: replace `userGuard` with `actorGuard` and type its operation on `ActorContext` (`ctx.var.actor`, never `ctx.var.user`), or remove `xTool`.
3. Remove `withReplayFlag` from each update `mutationFn`: it sends the `stx` from its variables as it is. Build that stx when the edit is made, in `prepare`, as `frontend/src/modules/attachment/query.ts` does.
4. Run `pnpm lint`. For each file under a module's `helpers/` that Biome reports: a function that reads or writes moves to `<module>-queries.ts`, one that calls queries or operations moves to `operations/`, and one that only needs a value from the context takes that value as an argument.
5. Imports of `#/modules/auth/general/helpers/finish-sign-in` point at `#/modules/auth/general/operations/finish-sign-in`.
6. Run `pnpm style`. Give each reported `useRouteContext()` a `select` that returns the id or flag the component reads, and replace `active:translate-y-0` on a `Button` with `press={false}`.
7. A mode config that sets `services.mcp.enabled: true` also sets `services.oauth.enabled: true`, or turns MCP off.
8. Set `memberStatProductTypes` in `shared/config/config.default.ts` to the products the members table counts; it ships as `['attachment']`.
9. Optional: pass `aria-label` to `ResizableSeparator`, naming the panel it resizes. It now shows a focus ring and has a default name.

## Verify

```sh
pnpm check
pnpm style
pnpm --filter backend test
```
