---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: oauth-state-, tokens_step_up_session_id_idx
generate: true
---

# One step-up code per session, one OAuth state cookie

An app runs `pnpm generate` for the unique index `tokens_step_up_session_id_idx` on `tokens.session_id` where
`type = 'step-up'`, with the statement in `data.sql` placed before it. App code or tests that set or read a state
cookie named `oauth-state-<state>` use the one `oauth-state` cookie, whose JSON payload holds `state`.

## What & why

Concurrent step-up code requests from one session each stored a live code, so a stolen session guessed against up to
ten. The index refuses the second insert, answered 409 `resource_already_exists` with no mail. Each provider or SSO
start set a Lax cookie named by its state, so another site's page could push the Cookie header past Node's limit:
`handleOAuthInitiation` writes one `oauth-state` cookie and `readOAuthCookie` compares its `state`.

## Blast radius

Every app: `backend/drizzle` is app-owned, so the migration has to be generated, and until it runs the inherited
step-up burst test fails. A round trip in flight during the deploy answers `invalid_state` once. No wire, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it produces one `CREATE UNIQUE INDEX "tokens_step_up_session_id_idx"`. Paste `data.sql` above it in the new `migration.sql`; no rename hints.
2. Replace `` `oauth-state-${state}` `` in app code or tests (a `mockCookieStore` seed, a cookie name) with `'oauth-state'`, and put `state` in the payload.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
