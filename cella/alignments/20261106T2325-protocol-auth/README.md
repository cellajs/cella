---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: readStepUp, requireStepUp, updateSessionSteppedUp, invokeToken, invoke-token, confirmMagicLink, credentialIds, findCredentialIdsByUser
---

# Step-ups count in the proving browser, emailed links redeem on a POST, and passkeys keep their transports

`sessions` gains `stepped_up_secret`, the hash of a new Strict `session-step-up` cookie, and a step-up stamp counts only for a request presenting it: `readStepUp` and `requireStepUp` take the request context where they took the session. `GET /auth/invoke-token/{type}/{token}` of an invitation or verification link redeems nothing: it holds the link in a `<type>-pending` cookie and redirects to `/auth/confirm-link/<type>`, whose form post `POST /auth/invoke-token/{type}` (`redeemLinkToken`) redeems it with a 303. `POST /auth/magic/confirm` answers 303. `passkeys.counter` is a bigint, `passkeys.transports` keeps what a registration reported, `totps.user_id` is unique, and a passkey challenge answers `credentials` (id and transports) where it answered `credentialIds`. Run `pnpm generate` once after the upgrade.

## What & why

A step-up stamped the session row and kept the token, so every copy of the session cookie passed every step-up tier for ten minutes; the stamp now goes out with a cookie of its own (`stampStepUp(ctx, via)`, read into `ctx.var.stepUpCookie` by `userGuard`). A mail scanner's GET or HEAD spent invitation and verification links (RFC 9110 §9.2.1); they now redeem only on the confirm page's post, as a magic link opened elsewhere does. A signature counter past 2^31 failed its write, two concurrent TOTP setups stored two secrets, and every passkey claimed the `internal` transport.

## Blast radius

Every app: two migrations. An app that calls `readStepUp`, `requireStepUp` or `updateSessionSteppedUp`, or whose tests open invitation or verification links with a GET, or expect 302 from the magic confirm, or reads `credentialIds`. No cache bump.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it writes `ALTER TABLE "sessions" ADD COLUMN "stepped_up_secret" varchar(255);`, `ALTER TABLE "passkeys" ADD COLUMN "transports" varchar(255)[];`, the `bigint` cast of `passkeys.counter` and the unique `totps_user_id_idx`; no hints, no hand-written SQL.
2. Pass `ctx` to `readStepUp` and `requireStepUp`; a route without `userGuard` passes `{ var: { session, stepUpCookie: getAuthCookie(ctx, 'session-step-up') } }`. Stamp a step-up with `stampStepUp`.
3. An app test that steps up and then calls a guarded route sends the cookies the step-up response set (`keepCookiesOf` in `backend/tests/security/session-helpers.ts`).
4. An app test that opens an invitation or verification link uses `openHeldLink` (`backend/tests/helpers.ts`), and expects 303 from the redeeming post and from `confirmMagicLink`.
5. An app link type of its own adds its entry to `redeemedLinkHandlers` in `open-link-token.ts`: typecheck flags it.
6. App code that reads a passkey challenge's `credentialIds` reads `credentials` (`{ id, transports? }`), and `findCredentialIdsByUser` is `findPasskeyCredentialsByUser`.

## Verify

```sh
pnpm generate
pnpm check
```
