# Session lookups survive outages, API keys need a step-up, sign-out ends half-finished flows

## What & why

`resolveSession` clears a cookie only on a 401, so a database outage signs nobody out. `createServiceAccount` and
`createApiKey` take `stepUpGuard`. The `oauth-connect` pin carries its `sessionId`: `spendCookieToken` refuses a token
whose session ended, and sign-out spends the pin and calls `dropHeldMagicLink`. `revokeMySessions` refuses
impersonation. A provider sign-up starts behind `maySignUp`. The login check ignores impersonations and answers
`login_required`; a lost interaction answers 400. Logs drop a database error's `detail`.

## Blast radius

Sync-breaking for apps that mint secrets on their own routes, customize sign-out or the connect flow, or read
`pgDetail` from logs. No database change. CI's schema-bust gate compares against the merge commit's first parent. An app
that never customized these areas is unaffected.

## Run

No script: manual.

## Manual steps

1. Add `stepUpGuard` to app routes that mint API keys or other lasting secrets, and wrap their frontend calls in `withStepUp`.
2. Issue app cookie tokens that serve one session with `sessionId`; a custom sign-out spends `oauth-connect` and calls `dropHeldMagicLink`.
3. Expect 403 `impersonation_forbidden` from `revokeMySessions` during an impersonation.
4. Log queries on `pgDetail` find nothing any more; use `pgCode` and `pgConstraint`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/session-model.test.ts backend/tests/security/step-up-routes.test.ts backend/tests/security/sign-out-oauth-connect.test.ts backend/tests/security/sign-out-magic-link.test.ts backend/tests/security/impersonation.test.ts backend/tests/security/oauth-grants.test.ts
pnpm check
```
