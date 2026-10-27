# Sessions and cookies

This document explains how sessions, devices, impersonation and the auth cookies work.

### TL;DR

A session is a random token in a cookie, and the database keeps only its hash. It lasts a week, an account holds at
most ten, and every early end records who ended it and why. Every auth cookie is signed, and only the ones a click from
a mail or a provider's callback must carry are Lax.

## Sessions

The session cookie carries a random token; `sessions.secret` stores its SHA-256 hash, so reading the table yields no session. `resolveSession(ctx)` reads the session a request presents from its cookies alone, so any process on the app origin can call it. A session lives a week. A browser holds one live session per account, and an account at most `maxSessionsPerUser` (10) besides impersonations.

Session rows are cached for 10 seconds. The process that revokes a session drops it at once, the API process drops a user's entries when CDC reports a change to the user, a membership or the system role, and any other process stops serving a revoked session within those 10 seconds. A session read that fails stays the request's failure, so the database being away never reads as signed out.

Every revocation before expiry goes through `revokeSessions`: it stamps the rows with who, when and why, drops the user's cached sessions and closes the streams bound to them. The row stays for the sessions list.

| Reason | When |
| --- | --- |
| `sign_out` | The browser signs out |
| `other_session` | The user ends it from another of their sessions |
| `mfa_enabled` | Turning MFA on ends every other regular session |
| `replaced` | A new sign-in in the same browser |
| `session_cap` | The oldest sessions beyond the cap, at a sign-in |
| `impersonation_stopped` | The admin stops, or the admin session under it ends |
| `user_deleted` | The account is deleted; the rows go with it, unstamped |

A client learns of a lost session from four 401 types: `unauthorized`, `no_session`, `session_expired` and `session_revoked`. The frontend redirects to sign-in on these alone, since any other 401 refuses a proof while signed in. What an open stream hears when its session ends or changes: [Sync engine](../SYNC_ENGINE.md#sse-wire).

## Devices

A sign-in sets a 400-day `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner, and the address lookup of the sign-in page recognizes a browser by it.

## Impersonation

A system admin's impersonation is a session of its own, one hour long, in its own cookie on top of the admin's session cookie. It authenticates only while that admin session lives, the admin holds the system role and the request comes from an allowed address. The admin acts as the user, never on the account: stepping up, revoking the user's sessions and every system route, impersonating again included, are refused. The server says who acts: `GET /me` names the admin as `impersonator` and the request log adds `impersonatorId`. The client keeps no impersonation state of its own.

## Cookies

Every auth cookie is signed, in every mode. The signature covers the cookie's versioned name and its expiry with the content, so a value handed out for one cookie, or kept past its max age, reads as nothing. `COOKIE_SECRET` is one secret or a comma-separated list: the first signs, any verifies, so a new secret rolls out before the old one retires. Cookies are named `<slug>-<name>-<cookieVersion>` (bumping `cookieVersion` signs everyone out), carry the `__Host-` prefix outside development, and are `HttpOnly`.

| Cookie | Holds | SameSite |
| --- | --- | --- |
| `session` | The session token | Strict |
| `impersonation` | An impersonation's session token, on top of `session` | Strict |
| `device-id` | The browser's device id, 400 days | Lax |
| `magic-requested` | The id of the magic link this browser asked for | Lax |
| `magic-pending` | A link opened here that waits for confirmation | Strict |
| `oauth-state-<state>` | The provider round trip: flow type, PKCE verifier and nonce, five minutes | Lax |
| `sso-recovery` | An institution's refused sign-in: the asserted address and the connection, ten minutes | Strict |
| `passkey-challenge`, `totp-challenge` | The WebAuthn challenge; the TOTP secret being set up | Strict |
| A token type's own cookie | The token, or a redeemed link's single-use value | Its policy |

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback. Every other cookie, the session first of all, is same-origin only.
