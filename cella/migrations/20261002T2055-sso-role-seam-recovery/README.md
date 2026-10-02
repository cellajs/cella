---
syncBreaking: false
clientCacheBump: false
---

# SSO follow-ups: the role seam, the recovery link and the federation logo

The role of a membership granted by an institution sign-in now comes from `roleFromClaims` in the new pinned file
`backend/src/modules/auth/sso/role-from-claims.ts`. An institution sign-in that finds its address on an existing
account answers 409 `sso_email_exists` (was `oauth_email_exists`) and the error page offers a sign-in link through
the new `POST /auth/sso/recovery-link`. `FederationConfig` gains an optional `logo`.

## What & why

Three leftovers of institutional sign-in. Apps map institution claims to their own roles in one place, instead of
editing two operations. A person who signed up before their institution was connected, or whose identifier at the
institution changed, gets back in with one click instead of a dead end. The "sign in with your institution" button
shows the federation's own logo.

## Blast radius

Not sync-breaking: one added route, one added optional config field, two added error keys, one added pinned file.
The default role is unchanged (least-privileged), so an app that does nothing behaves as before. No schema change,
no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `pnpm sdk`; add the `sso_email_exists`, `sso_recovery_expired`, `c:sso_recovery_send` and `c:connect_institution_prompt.text` locale keys if the app keeps its own locale files.
2. Optional: fill `roleFromClaims` with the app's mapping, for example `eduperson_affiliation` `employee` to a staff role; the file is pinned, so later syncs leave it alone.
3. Optional: an app with its own federation sets `logo` to a file under `frontend/public`; without it the button keeps the generic icon and names the federation in its label.
4. An app that matched on `oauth_email_exists` for SSO collisions matches `sso_email_exists` instead; provider (OAuth) collisions keep `oauth_email_exists`.

## Verify

```sh
pnpm --filter backend test
pnpm check
```
