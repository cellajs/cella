# Sessions and cookies

This document explains how sessions, devices and the auth cookies work.

### TL;DR

A session is a random token in a cookie, and the database keeps only its hash. It expires after a week, an account
holds a capped number, and every early end records who ended it and why. Every auth cookie is signed, and only the
ones a click from a mail or a provider's callback must carry are Lax.

## Sessions

`resolveSession(ctx)` reads a request's session from its cookies alone, so any process on the app origin can call it.

- **One per account.** A browser holds one live session per account.
- **Same-site sign-in.** It ends the session it replaces, even another account's.
- **Cross-site sign-in.** It arrives without the old cookie, so another account's session runs out alone.
- **Brief cache.** A revocation, membership or system role change reaches every process within seconds.
- **Outage is no sign-out.** A failed session read fails the request, never reading as signed out.

An ended session keeps its row for the sessions list, stamped with who ended it and why:

- a sign-out
- an end from another session
- turning MFA on
- a newer sign-in in the same browser
- the session cap

Its app streams close at once. Its collaborative editor sockets, and the editor tokens minted before the end, lapse within five minutes.

Ending another session asks this one for a [step-up](../AUTHENTICATION.md#step-up), so a copied cookie cannot end each new sign-in of the owner. Signing out asks nothing.

A sign-out ends the session and any sign-in in progress before it clears a cookie. A failed sign-out thus leaves the browser signed in. The sign-out page then offers to try again.

A sign-out also clears an opened invitation, so the next person at the browser cannot read it. It sends no `Clear-Site-Data`, so other accounts' offline work and the device cookie survive.

A client learns of a lost session from four 401 types: `unauthorized`, `no_session`, `session_expired` and `session_revoked`. The frontend redirects to sign-in on these alone. Any other 401 refuses a proof while signed in.

A session route's 401 to a request with a session cookie carries no `WWW-Authenticate`. The body's `type` says what ended or failed.

## Devices

A sign-in sets a long-lived `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash, so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner. The address lookup of the sign-in page recognizes a browser by its device id.

## Cookies

- **Signed.** Every auth cookie is signed in every mode, over its name, expiry and content.
- **Bound to its name.** A value moved to another cookie, or kept past its max age, reads as nothing.
- **Rotatable secret.** `COOKIE_SECRET` takes a list, so a new secret rolls out before the old one retires.
- **Versioned names.** Bumping `cookieVersion` renames every cookie and so signs everyone out.
- **Host-only.** Outside development the cookies carry the `__Host-` prefix, and all are `HttpOnly`.
- **Lasting session.** The session cookie lasts as long as its session, so it survives a browser restart.

| Cookie | Holds | SameSite |
| --- | --- | --- |
| `session` | The session token | Strict |
| `session-step-up` | The proof of the session's last step-up, which counts only with it | Strict |
| `device-id` | The browser's device id | Lax |
| `magic-requested` | The magic link this browser asked for | Lax |
| `magic-pending`, `invitation-pending`, `oauth-verification-pending` | A link opened here that waits for confirmation | Strict |
| `oauth-state` | The provider round trip, which a new start replaces | Lax |
| `sso-recovery` | An institution's refused sign-in | Strict |
| `passkey-challenge`, `totp-challenge` | The WebAuthn challenge, and the TOTP secret being set up | Strict |
| A token kind's own cookie | The token, or a redeemed link's single-use value | Its policy |

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback. Every other cookie, the session first of all, is same-origin only.

No anti-forgery token. A write from another site fails on each of:

- the Strict session cookie
- the Origin or `Sec-Fetch-Site` check every form or text body gets
- the CORS preflight every JSON body needs, since the API grants no other origin
