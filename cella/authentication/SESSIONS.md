# Sessions and cookies

This document explains how sessions, devices, impersonation and the auth cookies work.

### TL;DR

A session is a random token in a cookie, and the database keeps only its hash. It expires after a week, an account
holds a capped number, and every early end records who ended it and why. Every auth cookie is signed, and only the
ones a click from a mail or a provider's callback must carry are Lax.

## Sessions

`resolveSession(ctx)` reads the session a request presents from its cookies alone, so any process on the app origin can call it. A browser holds one live session per account. Sessions are cached briefly: a revocation, a membership change or a change to the system role reaches every process within seconds. A session read that fails fails the request, so the database being away never reads as signed out.

An ended session keeps its row for the sessions list, stamped with who ended it and why: a sign-out, an end from another session, turning MFA on, a newer sign-in in the same browser, the session cap, or a stopped impersonation. Its streams end with it.

A client learns of a lost session from four 401 types: `unauthorized`, `no_session`, `session_expired` and `session_revoked`. The frontend redirects to sign-in on these alone, since any other 401 refuses a proof while signed in.

## Devices

A sign-in sets a long-lived `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner, and the address lookup of the sign-in page recognizes a browser by it.

## Impersonation

A system admin's impersonation is a short session of its own, in a cookie on top of the admin's session cookie. It holds only while the admin's session does and the admin keeps the system role. The admin holds it, so the user's sessions list leaves it out.

The admin acts as the user, never on the account: stepping up, every step-up guarded route, revoking the user's sessions and every system route (impersonating again included) answer 403 `impersonation_forbidden`. The server says who acts: `GET /me` names the admin as `impersonator` and the request log adds `impersonatorId`. The client keeps no impersonation state of its own.

## Cookies

Every auth cookie is signed, in every mode. The signature covers the cookie's name and expiry with its content, so a value moved to another cookie, or kept past its max age, reads as nothing. `COOKIE_SECRET` takes a comma-separated list: the first signs and any verifies, so a new secret rolls out before the old one retires.

Bumping `cookieVersion` renames every cookie and so signs everyone out. Outside development the cookies carry the `__Host-` prefix, and all are `HttpOnly`.

| Cookie | Holds | SameSite |
| --- | --- | --- |
| `session` | The session token | Strict |
| `impersonation` | An impersonation's session token | Strict |
| `device-id` | The browser's device id | Lax |
| `magic-requested` | The magic link this browser asked for | Lax |
| `magic-pending` | A link opened here that waits for confirmation | Strict |
| `oauth-state-<state>` | The provider round trip | Lax |
| `sso-recovery` | An institution's refused sign-in | Strict |
| `passkey-challenge`, `totp-challenge` | The WebAuthn challenge; the TOTP secret being set up | Strict |
| A token type's own cookie | The token, or a redeemed link's single-use value | Its policy |

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback. Every other cookie, the session first of all, is same-origin only.
