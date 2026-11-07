# Sessions and cookies

This document explains how sessions, devices and the auth cookies work.

### TL;DR

A session is a random token in a cookie, and the database keeps only its hash. It expires after a week, an account
holds a capped number, and every early end records who ended it and why. Every auth cookie is signed, and only the
ones a click from a mail or a provider's callback must carry are Lax.

## Sessions

`resolveSession(ctx)` reads the session a request presents from its cookies alone, so any process on the app origin can call it. A browser holds one live session per account. A same-site sign-in (a passkey, MFA completion, a confirmed magic link) also ends the session it replaces, another account's too; a provider or institutional sign-in returns cross-site without the old session cookie, so another account's session it replaces runs out on its own. Sessions are cached briefly: a revocation, a membership change or a change to the system role reaches every process within seconds. A session read that fails fails the request, so the database being away never reads as signed out.

An ended session keeps its row for the sessions list, stamped with who ended it and why: a sign-out, an end from another session, turning MFA on, a newer sign-in in the same browser or the session cap. Its app streams (SSE) close at once. Its collaborative editor sockets, and the editor tokens minted before the end, lapse within five minutes, the lifetime of an editor token.

Ending another session asks this one for a [step-up](../AUTHENTICATION.md#step-up), so a copied cookie cannot end each new sign-in of the owner; signing out asks nothing. A sign-out, an end from another session and turning MFA on also delete the account's opened magic link, so the browser that opened it cannot sign in again from its history.

A sign-out ends the session and what the browser holds of a sign-in in progress before it clears any cookie. It also clears an opened invitation, so the next person at the browser cannot read it; an invitee who signs out to answer with another account asks for a new link. A sign-out that fails leaves the browser signed in with all its cookies, and the sign-out page says so and offers to try again. Sign-out sends no `Clear-Site-Data`: the app clears its own data for the account that signs out, since the header's storage and cookie types would also take other accounts' offline work and the device cookie.

A client learns of a lost session from four 401 types: `unauthorized`, `no_session`, `session_expired` and `session_revoked`. The frontend redirects to sign-in on these alone, since any other 401 refuses a proof while signed in. A session route's 401 to a request that presents a session cookie carries no `WWW-Authenticate`, since no HTTP authentication scheme names a cookie session: the body's `type` says what ended or failed.

## Devices

A sign-in sets a long-lived `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner, and the address lookup of the sign-in page recognizes a browser by it.

## Cookies

Every auth cookie is signed, in every mode. The signature covers the cookie's name and expiry with its content, so a value moved to another cookie, or kept past its max age, reads as nothing. `COOKIE_SECRET` takes a comma-separated list: the first signs and any verifies, so a new secret rolls out before the old one retires.

Bumping `cookieVersion` renames every cookie and so signs everyone out. Outside development the cookies carry the `__Host-` prefix, and all are `HttpOnly`. The session cookie lasts as long as its session, so a sign-in survives a browser restart.

| Cookie | Holds | SameSite |
| --- | --- | --- |
| `session` | The session token | Strict |
| `session-step-up` | The proof of the session's last step-up, which counts only with it | Strict |
| `device-id` | The browser's device id | Lax |
| `magic-requested` | The magic link this browser asked for | Lax |
| `magic-pending`, `invitation-pending`, `oauth-verification-pending` | A link opened here that waits for confirmation | Strict |
| `oauth-state` | The provider round trip; a new start replaces it | Lax |
| `sso-recovery` | An institution's refused sign-in | Strict |
| `passkey-challenge`, `totp-challenge` | The WebAuthn challenge; the TOTP secret being set up | Strict |
| A token type's own cookie | The token, or a redeemed link's single-use value | Its policy |

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback. Every other cookie, the session first of all, is same-origin only.

No anti-forgery token: a write from another site fails on the Strict session cookie, on the Origin or `Sec-Fetch-Site` check every form or text body gets, and on the CORS preflight every JSON body needs, since the API grants no other origin.
