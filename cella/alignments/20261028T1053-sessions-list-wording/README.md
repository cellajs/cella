---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: revoke_others, expires_relative
---

# Sessions list speaks of signing out

App code that reads the removed locale keys `c:session`, `c:revoke_others` or `c:expires_relative` switches to
`c:sessions`, `c:sign_out_others` or `c:signed_in_relative`. An app whose `app.json` overrides `sessions.text` adds the
`{{days}}` placeholder, or drops the override.

## What & why

The account sessions card says "Sign out" where it said "Revoke", shows ended sessions muted and closed by default, names
a session after its browser on its OS (`DeviceTile`, passkeys too) and leads each live one with when it signed in.
`findUserSessions` leaves impersonations out: the admin holds them, and the user read one as an unknown sign-in.
`session:mint` deletes the ended mints of earlier runs.

## Blast radius

Apps whose own code or `app.json` uses the keys above. No database, lens or `clientCacheVersion` change. An app that
never customized the sessions card gets the change for free.

## Run

No script: manual.

## Manual steps

1. Replace `t('c:session')`, `t('c:revoke_others')` and `t('c:expires_relative', …)` in app code.
2. In `locales/*/app.json`, rename or drop overrides of `revoke_others` and `expires_relative`, and give a `sessions.text` override `{{days}}`.

## Verify

```sh
pnpm check
```
