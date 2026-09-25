# Magic-link confirmation, MFA factor rules and strategy gating

## What & why

A magic link opened outside the browser that asked for it lands on `/auth/confirm-sign-in` and signs in on a click (`POST /auth/magic/confirm`). Auth routes declare `x-strategy`, and a switched-off method is refused before any guard. MFA needs a passkey and an authenticator app: enabling requires both, and neither can be deleted while MFA is on. `POST /auth/resend-invitation` takes `{ tokenId }` only and always answers 204.

## Blast radius

Sync-breaking for apps with their own auth routes or sign-in pages, and for callers of `resendInvitation` with an email. Adds a frontend route. No database change.

## Run

No script: manual.

## Manual steps

1. Every route in an app's own auth modules declares `'x-strategy'` (a method, `{ oauth: provider }`, a per-request function, or `null`); `backend/tests/auth-strategies/route-strategies.test.ts` lists the template's.
2. `pnpm --filter frontend gen:routes` after the sync.
3. Callers of `resendInvitation` send `{ tokenId }`.
4. Tests that open a magic link as the browser that asked for it send `authCookie('magic-requested', tokenId)`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security backend/tests/sign-in
pnpm check
```
