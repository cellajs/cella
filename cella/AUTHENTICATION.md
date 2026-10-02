# Authentication

This document explains everything authentication.

### TL;DR

Nobody has a password. A person proves an inbox with a magic link, a device with a passkey, or an account at a
provider, and gets a session whose cookie holds a random token while the database holds only its hash. Everything
that must work once, such as an emailed link or a second-factor challenge, is a token with one lifecycle, and the
actions that change how an account is protected first ask the session to prove its user again.

## Sign-in methods

| Method | What proves the person | Module |
| --- | --- | --- |
| Magic link | The inbox: a link mailed to the address, opened in the browser that asked for it | `auth/magic/` |
| Passkey | A WebAuthn credential on the device, answering a challenge issued for `authentication` | `auth/passkeys/` |
| Provider sign-in | An account at GitHub, Google or Microsoft, stored in `identities` by issuer and subject | `auth/oauth/` |
| TOTP | A code from an authenticator app; a second factor only, never a first | `auth/totps/` |

`appConfig.enabledAuthStrategies` says which methods are on. Every auth route names its method as its config switch, `xEnabledBy: { strategy: <method> }` (an OAuth provider's routes add `provider`), so a route of a method that is off answers 400 `forbidden_strategy` (`unsupported_oauth` for a provider) before its guards run; deleting a passkey or TOTP names no switch and stays reachable. The token link route serves every link type, so it checks the magic switch in the magic link's handler. The sign-in page starts by posting the address to `check-email`, which answers `recognized: true` only to a browser that has signed in to that account before (the signed `device-id` cookie plus a `devices` row); every other browser gets the neutral sign-in step, whether or not the address has an account.

A magic-link or provider sign-in ends in `finishSignIn`: a session, or first an MFA challenge when the account requires one. A passkey sign-in sets the session at once. A system administrator signs in, and counts as one, only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST`, which defaults to `none`.

## Sign-up

An account exists only once its inbox is proven. `handleCreateUser(ctx, { newUser, via })` creates the user with its email row verified `via` the proof and binds the invitations waiting for the address, in one transaction, so no unproven account ever holds an address. A magic link to an unknown address names no user: the account is created when the link is clicked (`claimMagicLinkOwner`). A provider sign-up waits on the verification mail sent to the provider's address, and the account is created when the same provider account signs in again in the browser that opened the mail. An invitee skips that mail only when the provider itself verified the invited address: an invitation link can be forwarded, so the opened link and the provider's verification prove the inbox together. `maySignUp` decides whether an address may sign up at all (open registration, or an invitation that still stands) and is asked at the start and again at the completion of a sign-up, since either may have changed in between. An invitation link not yet bound to an account can be accepted by whoever opens it, as the account they are signed in to.

An account is identified by the proofs it holds, never by an address; the identities and emails tables: [Architecture](./ARCHITECTURE.md#trust-boundaries).

## Sessions

The session cookie carries a random 40-character token; `sessions.secret` stores its SHA-256 hash, so reading the table yields no session. `resolveSession(ctx)` reads the session a request presents from its cookies alone, so any process on the app origin can call it. `readSession(token)` turns a token into its row, from a 10-second cache or the database. The process that revokes a session drops it at once, the API process drops a user's entries when CDC reports a change to the user, a membership or the system role, and any other process stops serving a revoked session within the 10 seconds. `findSession(ctx)` serves requests that may carry no session: a refusal reads as null, while a failed read stays the request's failure, so the database being away never reads as signed out. A session lives a week. A browser holds one live session per account, and an account at most `maxSessionsPerUser` (10) besides impersonations.

Every revocation before expiry goes through `revokeSessions`. It stamps the rows with `revokedAt`, `revokedBy` and a `revocationReason`, drops the user's cached sessions and closes the streams bound to them; the row stays for the sessions list.

| Reason | When |
| --- | --- |
| `sign_out` | The browser signs out |
| `other_session` | The user ends it from another of their sessions (`revokeMySessions`) |
| `mfa_enabled` | Turning MFA on ends every other regular session |
| `replaced` | A new sign-in in the same browser |
| `session_cap` | The oldest sessions beyond the cap, at a sign-in |
| `impersonation_stopped` | The admin stops, or the admin session under it ends |
| `user_deleted` | The account is deleted; the rows go with it, unstamped |

A client learns of a lost session from four 401 types, `unauthorized`, `no_session`, `session_expired` and `session_revoked` (`sessionLostTypes`): the frontend redirects to sign-in on these alone, since any other 401 refuses a proof while signed in. An open SSE stream hears `session_replaced` when the browser holds a newer session and `access_changed` when the system role changed, and reconnects; a sweep re-checks the session behind every open stream each minute.

**Devices.** A sign-in sets a 400-day `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner, and `check-email` recognizes a browser by it.

**Impersonation.** A system admin's impersonation is a session of its own (`type: 'impersonation'`, one hour) in its own cookie, layered on the admin's session cookie: it authenticates only while that admin session lives, the admin holds the system role and the request comes from an allowed address. The admin acts as the user, never on the account: stepping up and revoking the user's sessions are refused with 403 `impersonation_forbidden` by their handlers, and every system route, impersonating again included, by `sysAdminGuard`.

## Cookies

Every auth cookie is signed, in every mode. The wire value is `<content>.<expiresAt>.<mac>`, and the MAC covers the cookie's versioned name and its expiry with the content, so a value handed out for one cookie, or kept past its max age, reads as nothing. `COOKIE_SECRET` is one secret or a comma-separated list: the first signs, any verifies, so a new secret rolls out before the old one retires; outside development every entry needs 16 characters. Cookies are named `<slug>-<name>-<cookieVersion>` (bumping `cookieVersion` signs everyone out), carry the `__Host-` prefix outside development, and are `HttpOnly`.

| Cookie | Holds | SameSite |
| --- | --- | --- |
| `session` | The session token | Strict |
| `impersonation` | An impersonation's session token, on top of `session` | Strict |
| `device-id` | The browser's device id, 400 days | Lax |
| `magic-requested`, `step-up-requested` | The id of the link this browser asked for | Lax |
| `magic-pending` | A link opened here that waits for confirmation | Strict |
| `oauth-state-<state>` | The provider round trip: flow type, PKCE verifier and nonce, five minutes | Lax |
| `passkey-challenge`, `totp-challenge` | The WebAuthn challenge; the TOTP secret being set up | Strict |
| A token type's own cookie | The token, or a redeemed link's single-use value | Its policy |

Lax cookies are the ones a navigation from another site must carry: the click from a mail, the provider's callback. Every other cookie, the session first of all, is same-origin only.

## Tokens

One module, `auth/tokens/`, issues, opens and spends every token. `tokens.secret` stores a hash of the raw value, which exists only in the link or the cookie that carries it. `tokenPolicies` declares one policy per type in `appConfig.tokenTypes`:

| Type | Carrier | Lives | Replaces earlier tokens of | A link without an account belongs to |
| --- | --- | --- | --- | --- |
| `magic` | link | 15 minutes, then 5 minutes single-use | the address or the account | the address's holder, else a new account |
| `invitation` | link | 7 days, then 30 minutes | the invitation | whoever is signed in |
| `oauth-verification` | link | 2 hours, then 5 minutes | the identity | the address's holder, else a new account |
| `step-up` | link | 10 minutes, then 5 minutes | the session | always bound to its session's user |
| `confirm-mfa` | cookie | 10 minutes | nothing | |
| `oauth-connect` | cookie | 10 minutes | the account | |

`invokeToken` redeems a link from the raw value in its URL: the first redemption wins a compare-and-set on `invokedAt`, the token's lifetime becomes its single-use window, and the browser gets a cookie of the type's name that binds the token to it. The response sets `Referrer-Policy: no-referrer` so the link token is not sent to the next page. `readBoundToken` reads the token a browser's cookie binds it to; `spendCookieToken` spends it once, so of two concurrent completions one passes. A token issued with a `sessionId` serves that session alone and dies with it. Each link type has its handler in `linkHandlers`; a type without one does not compile.

A magic link signs in directly only in the browser that asked for it, which remembers the request in `magic-requested` (`rememberLinkRequest`, `requestedHere`). Opened anywhere else, the link is held in `magic-pending` and the holder confirms on `/auth/confirm-sign-in`, a page that names the address: a link planted in someone's browser, or fetched by a mail scanner, signs nobody in and is not used up. A link of another account than the one signed in answers 409 `user_mismatch`; an expired one 401 `<type>_expired` with the token id, so the error page can offer a new link.

## Second factors and MFA

A passkey challenge is 32 random bytes, handed to the browser in the signed `passkey-challenge` cookie while `passkey_challenges` stores its hash with a purpose (`registration`, `authentication`, `mfa`, `step-up`) and, for `mfa` and `step-up`, the account it was issued for. Verifying a response deletes the row first, so a challenge answers one ceremony of its purpose at most once. A signature counter only moves forward, and a credential id names one account.

`verifyTotp` is the one TOTP check. The secret is encrypted at rest under `DATA_ENCRYPTION_KEY`. A code verifies within a minute of now and only for a time step later than `totps.last_used_step`, which it spends: each code counts once. Every check draws on the account's failure budget, whatever the IP: 5 failures in an hour lock the account's TOTP checks for 30 minutes and mail the owner, and the lockout lives in the database, so every process honours it.

MFA (`users.mfaRequired`) needs both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in; turning it on and deleting a factor run under a row lock (`mfaFactorRules`). A sign-in of such an account issues a `confirm-mfa` token in its cookie, carrying the method the sign-in started with, and lands on `/auth/mfa`. `completeMfaChallenge` is the only way out: it verifies the offered factor for the challenge's account, spends the challenge and signs in with an `mfa` session that records that method as `authStrategy` and the factor as its step-up (`steppedUpVia`), so a tenant's sign-in policy and the step-up window read the same row.

## Step-up

The routes that change how an account is protected carry `stepUpGuard` after `userGuard`: factors, the MFA toggle, provider connect, account deletion, and creating a service account or minting an API key; OAuth consent runs the same check (`requireStepUp`). The session must have proven its user within the last ten minutes (`stepUpWindow`): with a passkey or TOTP the user holds, by a step-up or by the sign-in itself, or, holding none, by any sign-in within the window or an emailed link opened in this browser. The refusal is 403 `step_up_required` with the methods the user can offer in `meta.methods`. On the frontend, `withStepUp(action)` runs the action, opens the "Confirm it's you" dialog on that refusal and runs the action once more. A step-up stamps `sessions.steppedUpAt` and `steppedUpVia`; an impersonation never steps up.

## The authorization server

The OAuth face keeps a session of its own in the browser and answers a client without the consent page only while that browser's app session belongs to the same person. Signing out, ending one's other sessions and turning MFA on delete the person's provider sessions. Tokens, scopes and consent: [Interoperability](./INTEROPERABILITY.md#face-oauth), [OAuth worker](../oauth/README.md).

## Rate limits

Routes declare their limiter in `xRateLimiter`, which appears in OpenAPI. The shared limiter can key counts by IP (an IPv6 client counts by `/64`), email, user, actor, or tenant; an IP or address enters the key as a keyed pseudonym (`PII_HASH_SECRET`), so `rate_limits` holds neither in the clear. `limit` counts every request. `success`, `fail`, and `failseries` reserve an attempt before the handler and return it unless the outcome counts, so parallel requests cannot exceed the budget; a `failseries` ends with a success. Failure budgets also count in a 24-hour bucket, where 100 failures block for three hours. Counts live in `rate_limits` and are shared across processes; if PostgreSQL is unavailable, the limiter falls back to process memory. A refusal returns `429 too_many_requests` with `Retry-After`. Work without an incoming request can charge a limiter directly through `chargeLimiter`.

| Limiter | Counts | Budget |
| --- | --- | --- |
| `magicLinkLimiter` | Magic links per address | 2 per 30 minutes |
| `emailEnumLimiter` | Address lookups per IP, hits included | 30 per hour, then 30 minutes blocked |
| `spamLimiter` | Mails sent per user, per IP when anonymous | 10 per hour |
| `tokenLimiter` | Failed link, callback and passkey sign-ins per IP; a success ends the series | 10, then 30 minutes blocked |
| `totpVerificationLimiter` | Failed TOTP codes per IP; a code that verifies ends the series | 5 per hour, then 30 minutes blocked |
| The TOTP account budget | Failed TOTP codes per account, whatever the IP | 5 per hour, then 30 minutes locked and a mail |
| `stepUpLimiter` | Failed second-factor checks on step-up, per account | 5 per hour, then 30 minutes blocked |
| `passkeyChallengeLimiter` | Passkey challenges per IP | 30 per hour |

Machine-facing rate limits: [Interoperability](./INTEROPERABILITY.md#quotas-and-limits).
