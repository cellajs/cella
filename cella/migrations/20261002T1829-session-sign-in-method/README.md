---
syncBreaking: true
clientCacheBump: false
---

# Sessions record the sign-in method, not the second factor

An MFA completion now mints the session with the method the sign-in started with (`sessions.authStrategy`, for example
`magic` or `github`) and stamps the factor as its step-up (`steppedUpAt` / `steppedUpVia`), where it used to write the
factor (`totp` / `passkey`) as the method. The `confirm-mfa` token carries that method in the new `tokens.authStrategy`
column; `sessions` gains a nullable `connectionId` for the SSO connection a sign-in will come through. `initiateMfa`
takes the strategy, `validateConfirmMfaToken` returns `{ user, token }`, and `setUserSession` / `createSession` accept
`{ steppedUpVia }`. `pnpm generate` emits both columns.

## What & why

`completeMfaChallenge` recorded the second factor as the session's `authStrategy`, so a magic-link or OAuth sign-in with
MFA on read as a `totp` session. A tenant policy on sign-in methods (`tenants.authStrategies`, enforced with SSO) needs
the method that started the sign-in; the factor belongs in the step-up stamp the session already has. `toggleMfaOp`
keeps the current session's method the same way.

## Blast radius

Sync-breaking only for an app that calls `initiateMfa`, `validateConfirmMfaToken` or reads an mfa session's
`authStrategy` as its factor; TypeScript reports the call sites. One schema migration, two nullable columns, no
backfill. No `clientCacheVersion` bump: the sessions list gains an optional `connectionId`.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits `sessions.connection_id` and `tokens.auth_strategy`; commit the folder.
2. Pass the sign-in method to `initiateMfa(ctx, user, strategy)` and read `validateConfirmMfaToken(ctx)` as `{ user, token }`.
3. An app test that fabricates an mfa session as `{ authStrategy: 'totp' }` becomes `{ authStrategy: '<method>', type: 'mfa', steppedUpVia: 'totp' }` (`insertTestSession` takes `steppedUpVia`); `createMfaToken(user, strategy)` names the method.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm --filter backend test
pnpm check
```
