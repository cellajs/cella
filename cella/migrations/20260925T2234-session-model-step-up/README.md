# Session tokens stored hashed, impersonation on its own cookie, step-up for account security

## What & why

The session cookie carries a random token and `sessions.secret` stores its hash (`resolveSession`, `readSession`).
Impersonation uses its own cookie and `sessions.impersonator_session_id`, and lives only while the admin's session and
role do. OAuth connect is pinned by an `oauth-connect` token. Account-security routes take `stepUpGuard`: a second
factor, a fresh sign-in, or an emailed `step-up` link. Token policies declare `replaces`; link types need a `linkHandlers` entry.

## Blast radius

Sync-breaking for every app: everyone signs in again, and custom session, connect, token-type or account-security code
changes. Adds columns to `sessions` and `tokens`.

## Run

No script: manual.

## Manual steps

1. `pnpm --filter backend generate` emits the `sessions` and `tokens` columns.
2. Replace `getParsedSessionCookie`, `validateSession` and `ctx.var.sessionToken` with `resolveSession`, `readSession` and `ctx.var.session`.
3. Add `replaces` (and `unboundOpener` for links) to app token policies, a `linkHandlers` entry per link type, and `oauth-connect` and `step-up` to `tokenTypes`.
4. Call `startOAuthConnect` before an app's own connect UI.
5. Add `stepUpGuard` to app-owned account-security routes.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/session-model.test.ts backend/tests/security/impersonation.test.ts backend/tests/security/step-up.test.ts
pnpm check
```
