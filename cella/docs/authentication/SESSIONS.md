# Sessions and cookies

This document explains how sessions, devices and the auth cookies work.

### TL;DR

A session is a random token in a cookie, and the database keeps only its hash. It expires after a week, an account
holds a capped number, and every early end records who ended it and why. Every auth cookie is signed, and only the
ones a click from a mail or a provider's callback must carry are Lax.

## Sessions

A session signs one browser in to one account. The stored hash of a session, an API key or a link is an HMAC under `DATA_HASH_SECRET`. A row written straight into the database with a hash of a chosen value matches nothing. If you change the secret, every session, API key and link ends at once.

A revocation, membership or system role change reaches every process within seconds. A failed session read fails the request and never reads as signed out.

Sign-ins in one browser do not stack up:

- **One per account.** A browser holds one live session per account.
- **Same-site sign-in.** It ends the session it replaces, even another account's.
- **Cross-site sign-in.** Another account's session runs out alone, since the sign-in arrives without the old cookie.

A sign-out ends the session and any sign-in in progress before it clears a cookie. A failed sign-out leaves the browser signed in, and the sign-out page offers to try again. A sign-out also clears an opened invitation: the next person at the browser cannot read it. Other accounts' offline work and the device cookie survive a sign-out: it sends no `Clear-Site-Data`.

An ended session keeps its row for the sessions list, stamped with who ended it and why, such as a sign-out, an end from another session or the session cap. Its streams close within a minute. Its collaborative editor sockets and the editor tokens minted before the end lapse within five minutes.

A copied cookie cannot end each new sign-in of the person it was copied from: ending another session asks this one for a [step-up](../AUTHENTICATION.md#step-up).

A client learns of a lost session from a 401's `type`: `unauthorized`, `no_session`, `session_expired` or `session_revoked`. The frontend redirects to sign-in on these. Any other 401 refuses a proof while signed in.

A session route's 401 to a request with a session cookie carries no `WWW-Authenticate`. The body's `type` says what ended or failed.

## Devices

A device id lets the server recognize a browser that signed in before: a sign-in from a new browser mails the person, unless it came through their inbox. A database leak cannot correlate browsers across accounts, since `DATA_HASH_SECRET` peppers the stored hash.

## Cookies

Auth cookies carry the session and the steps of a sign-in.

| Cookie | What it holds | SameSite |
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

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback.

- **Signed.** Every auth cookie is signed in every mode, over its name, expiry and content.
- **Bound to its name.** A value moved to another cookie, or kept past its max age, reads as nothing.
- **Rotatable secret.** You roll out a new cookie secret before retiring the old one.
- **Versioned names.** When you bump `cookieVersion`, every cookie is renamed and everyone is signed out.
- **Host-only.** Outside development the cookies carry the `__Host-` prefix. All are `HttpOnly`.

The API needs no anti-forgery token. A write from another site fails on each of:

- the Strict session cookie
- the Origin or `Sec-Fetch-Site` check every form or text body gets
- the CORS preflight every JSON body needs, since the API grants no other origin
