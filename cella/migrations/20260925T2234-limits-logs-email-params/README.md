# Burst-proof limits, query-free logs, hashed unsubscribe tokens, email param keys

## What & why

Rate-limit budgets reserve a point before the handler and block in the database only, so a burst cannot pass a spent
budget. Logs and spans keep a failed query's reason, never its SQL or parameters; server messages show in development
and test only. `unsubscribe_tokens.secret` stores a hash. Email templates name params with `param('<key>')`, which
carries a per-send nonce. `COOKIE_SECRET` entries need 16 characters outside development. `clientCacheVersion` is bumped.

## Blast radius

Sync-breaking for apps with email templates naming params, unsubscribe inserts, custom limiters, or short secrets.
Clients drop their entity cache once. Adds a side-effect backfill.

## Run

No script: manual.

## Manual steps

1. Replace literal `{{params.<key>}}` in app templates with `param('<key>')`.
2. Insert unsubscribe rows through `unsubscribeTokenRow`.
3. Rotate any `COOKIE_SECRET` entry or `UNSUBSCRIBE_SECRET` shorter than 16 characters before deploying.
4. `pnpm --filter backend generate` emits the unsubscribe hash backfill.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/failed-query-redaction.test.ts backend/src/middlewares/rate-limiter
pnpm check
```
