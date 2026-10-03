---
syncBreaking: true
clientCacheBump: false
---

# The server names the admin behind an impersonation

`GET /me` returns `impersonator` (a minimal user, or null) and the client stores it with the user: read
`useUserStore((state) => state.impersonator)` where app code read `useUIStore`'s `impersonating`, which is gone with
`setImpersonating`. `useUserStore`'s `setUser` and `setIsSystemAdmin` become one `setMe(me)`. On the backend
`ctx.var.impersonator` holds the admin behind `userGuard`, `resolveSession` returns it, and `findSessionById` is removed.

## What & why

The client kept `impersonating` as its own flag in localStorage. It stayed set after the impersonation's hour, and
`POST /auth/impersonation/stop` then answered 400, so the tab could not leave it. Now `/me` is the one source, the stop
answers 204 without an impersonation, an impersonation session records its admin's `authStrategy`, `tenantGuard` exempts
impersonations from `tenants.authStrategies`, and the request log adds `impersonatorId`.

## Blast radius

Sync-breaking only for an app that reads or sets `impersonating`, calls `setUser`, `setIsSystemAdmin` or
`findSessionById`, or builds a `Me` response itself; TypeScript reports each. No database change, no
`clientCacheVersion` bump: `Me` gains a field.

## Run

No script: manual.

## Manual steps

1. `useUIStore((state) => state.impersonating)` → `useUserStore((state) => state.impersonator)` (truthy while impersonated).
2. `setUser(user, skipLastUser)` + `setIsSystemAdmin(flag)` → `setMe({ user, isSystemAdmin, impersonator })`.
3. Drop calls to `setImpersonating`: `startImpersonationFlow` and `stopImpersonationFlow` write the store from `/me`.
4. `findSessionById` → `ctx.var.impersonator` for the admin behind an impersonation.
5. An app test that fabricates a `Me` response adds `impersonator: null`.

## Verify

```sh
pnpm sdk
pnpm --filter backend test
pnpm check
```
