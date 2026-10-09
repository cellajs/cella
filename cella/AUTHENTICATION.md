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

`appConfig.enabledAuthStrategies` says which methods are on. A route of a method that is off refuses before its guards run; deleting a passkey or TOTP stays reachable. The sign-in page first asks whether the address is known, and learns it only in a browser that signed in to that account before. Every other browser gets the neutral sign-in step, whether or not the address has an account.

A magic-link or provider sign-in ends in a session, or first in an MFA challenge when the account requires one. A passkey sign-in sets the session at once. A system administrator signs in, and counts as one, only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST`, which defaults to `none`.

## Sign-up

An account exists only once its inbox is proven:

- **One transaction.** The user, its verified email row and the invitations waiting for the address are created together, so no unproven account ever holds an address.
- **Magic link.** A link to an unknown address names no user. The account is created when the link is clicked.
- **Provider.** A provider sign-up waits on a verification mail to the provider's address. The account is created when the same provider account signs in again in the browser that opened the mail.
- **Invitation.** An invitee skips that mail only when the provider itself verified the invited address: an invitation link can be forwarded, so the opened link and the provider's verification prove the inbox together. A link not yet bound to an account can be accepted by whoever opens it, as the account they are signed in to.
- **Who may sign up.** Open registration, or an invitation that still stands. It is asked at the start of a sign-up and again at its completion, since either may have changed in between.

An account is identified by the proofs it holds (`identities`, `emails`), never by an address: [Architecture](./ARCHITECTURE.md#trust-boundaries).

## Institutional sign-in (SSO)

Institutions sign their members in through an identity federation (`sso`), SURFconext first.

| Concept | Meaning |
| --- | --- |
| **Federation** | Declared in `appConfig.federations` as public metadata. Its key is also the session strategy, the identities issuer slug and the env prefix of the client this deployment registered there (`SSO_<KEY>_CLIENT_ID`, `SSO_<KEY>_CLIENT_SECRET`). A mode config can point a key at the federation's test issuer. |
| **Connection** | A tenant's trust in one institution (`backend/src/modules/connections/`): the federation, the institution's domains and IdPs, a status that stays `pending` until the institution activated the app at the federation, and `jitProvisioning`. System admins manage connections per tenant, and a domain belongs to one connection. |
| **Entry** | The connection's id is the public entry key. `/auth/sso/:connectionId` is the link an institution shares, pinned to its IdPs. Starting from the federation goes without a pin, so the federation's own picker lists the connected institutions. |
| **Callback** | One redirect URI, registered at every federation. A state cookie says which federation and connection a round trip belongs to. |

A sign-in at the callback:

1. **Verifies** the `id_token` in full and reads userinfo.
2. **Asserts the institution.** The connection the round trip started from, or the active connection whose domains hold the asserted value, must accept the claim. Otherwise the sign-in is refused.
3. **Finds or creates the account.** The identity is the federation's issuer and subject. A first sign-in creates the account with its address proven by the institution. It is refused without an address, when an account already holds the address (see below), or when neither the connection's `jitProvisioning` nor an invitation admits the address.
4. **Makes it a member** of the tenant's organization, unless an invitation to that organization already names the role.
5. **Records the method.** The session carries the federation and the connection, which the tenant's sign-in policy reads.

A connect links the institution account to a signed-in user, as a provider connect does. Where the federation operates the mailboxes it asserts (`addressAuthority`), a changed institutional address joins the account's `emails`; a magic link later resumes from there.

**The role of that membership** comes from `roleFromClaims` (`backend/src/modules/auth/sso/role-from-claims.ts`), a pinned file an app fills to map what the institution asserts, such as `eduperson_affiliation`, to its own organization roles. The default is the least-privileged role. It is asked once, when the membership is created; later sign-ins never change a role.

**An address that already has an account.** A person who signed up before their institution was connected, or whose identifier at the institution changed, is refused, and the error page offers a sign-in link for ten minutes. It mails a magic link to the asserted address, and the link lands on the account page with an offer to connect the institution account. The address never travels in a URL, and no one can ask for the link without first signing in at the institution. Without the `magic` strategy the page keeps its plain sign-in button.

**Where SSO shows.** On the entry page an institution shares; on the authenticate page, as "sign in with <institution>" when an invitation names an organization whose tenant has an active connection, and as one "sign in with your institution" button per federation with a connected institution; on the account page, as a connect button per institution of the user's organizations; and in the tenant sheet, where system admins manage connections and the tenant's allowed sign-in methods.

**The tenant's sign-in policy.** `tenants.authStrategies` (empty = every enabled method) is enforced by `tenantGuard`. A person who holds an identity through the tenant's connection must act with an allowed method, by session or by a delegated token, else 403 `sso_required` with the connection and its entry path in `meta`. Externals without such an identity are untouched. System admins are exempt, also while they act as a user through an impersonation.

A delegated token carries the method and connection of the session that consented, so a token minted from a magic-link session cannot bypass a tenant that requires SSO. An address proven through a federation inherits the policy for magic links: while the tenant excludes `magic`, a magic link for that address is not sent and the request answers `sso_required`; the user keeps every other method and address. The recovery link above is the one exception, and only for a collision at the connection that governs the address: it takes the institution account and the mailbox together.

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

A client learns of a lost session from four 401 types: `unauthorized`, `no_session`, `session_expired` and `session_revoked`. The frontend redirects to sign-in on these alone, since any other 401 refuses a proof while signed in. What an open stream hears when its session ends or changes: [Sync engine](./SYNC_ENGINE.md#sse-wire).

**Devices.** A sign-in sets a 400-day `device-id` cookie and records its per-user hash in `devices`. `PII_HASH_SECRET` peppers the hash so a database leak cannot correlate browsers across accounts. A sign-in from a browser the account has not used before mails the owner, and the address lookup of the sign-in page recognizes a browser by it.

**Impersonation.** A system admin's impersonation is a session of its own, one hour long, in its own cookie on top of the admin's session cookie. It authenticates only while that admin session lives, the admin holds the system role and the request comes from an allowed address. The admin acts as the user, never on the account: stepping up, revoking the user's sessions and every system route, impersonating again included, are refused. The server says who acts: `GET /me` names the admin as `impersonator` and the request log adds `impersonatorId`. The client keeps no impersonation state of its own.

## Cookies

Every auth cookie is signed, in every mode. The signature covers the cookie's versioned name and its expiry with the content, so a value handed out for one cookie, or kept past its max age, reads as nothing. `COOKIE_SECRET` is one secret or a comma-separated list: the first signs, any verifies, so a new secret rolls out before the old one retires. Cookies are named `<slug>-<name>-<cookieVersion>` (bumping `cookieVersion` signs everyone out), carry the `__Host-` prefix outside development, and are `HttpOnly`.

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

Opening a link redeems it: the first redemption wins, the token's lifetime becomes its single-use window, and the browser gets a cookie that binds the token to it. A bound token is spent once, so of two concurrent completions one passes. A token issued for a session serves that session alone and dies with it. Each link type has its handler in `linkHandlers`; a type without one does not compile.

A magic link signs in directly only in the browser that asked for it. Opened anywhere else, the link is held and the holder confirms on a page that names the address: a link planted in someone's browser, or fetched by a mail scanner, signs nobody in and is not used up. A link of another account than the one signed in is refused, and an expired one leads to an error page that offers a new link.

## Second factors and MFA

A passkey challenge is issued for one purpose (registration, sign-in, MFA or step-up) and, for the last two, for one account. The browser holds it in a signed cookie and the database holds its hash. Verifying a response deletes the challenge first, so it answers one ceremony of its purpose at most once. A signature counter only moves forward, and a credential id names one account.

A TOTP secret is encrypted at rest under `DATA_ENCRYPTION_KEY`. A code verifies within a minute of now and counts once. Every check draws on the account's failure budget, whatever the IP ([Rate limits](#rate-limits)), and the lockout lives in the database, so every process honours it.

MFA (`users.mfaRequired`) needs both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in. A sign-in of such an account issues a `confirm-mfa` challenge that carries the method the sign-in started with. Completing it is the only way in: the offered factor is verified for the challenge's account, the challenge is spent, and the session records that method and the factor as its step-up, so a tenant's sign-in policy and the step-up window read the same row.

## Step-up

The routes that change how an account is protected carry `stepUpGuard` after `userGuard`: factors, the MFA toggle, provider connect, account deletion, and creating a service account or minting an API key. OAuth consent runs the same check.

The session must have proven its user within the last ten minutes: with a passkey or TOTP the user holds, by a step-up or by the sign-in itself, or, holding none, by any sign-in within the window or an emailed link opened in this browser. The refusal is 403 `step_up_required` with the methods the user can offer in `meta.methods`. An impersonation never steps up.

On the frontend, `withStepUp(action)` runs the action, opens the "Confirm it's you" dialog on that refusal and runs the action once more. For a user without a passkey or TOTP the dialog mails the confirmation link as it opens, and offers a new sign-in for when that mail cannot be opened in this browser. The link opens in a tab of its own, and the tab that asked carries on by itself.

## The authorization server

The OAuth face keeps a browser session of its own, which signing out, ending one's other sessions and turning MFA on end as well: [OAuth worker](../oauth/README.md#clients-and-consent). Tokens, scopes and consent: [Interoperability](./INTEROPERABILITY.md#face-oauth).

## Rate limits

Routes declare their limiter in `xRateLimiter`, which appears in OpenAPI. A limiter keys its counts by IP (an IPv6 client by its `/64`), email, user, actor or tenant, and an IP or address enters the key as a keyed pseudonym, so `rate_limits` holds neither in the clear. Counts are shared across processes, with process memory as the fallback while PostgreSQL is away. A refusal is `429 too_many_requests` with `Retry-After`.

A limiter either counts every request and refuses a spent key until its window ends (an hour for a budget, minutes to pace a route whose client retries), or counts by outcome: successes, failures, or a series of failures that a success ends. Counting by outcome reserves an attempt before the handler runs and returns it unless the outcome counts, so parallel requests cannot exceed a budget.

| Limiter | Counts | Budget |
| --- | --- | --- |
| `magicLinkLimiter` | Magic links per address | 2 per 30 minutes |
| `emailEnumLimiter` | Address lookups per IP, hits included | 30 per hour |
| `spamLimiter` | Mails sent per user, per IP when anonymous | 10 per hour |
| `tokenLimiter` | Failed link, callback and passkey sign-ins per IP; a success ends the series | 10, then 30 minutes blocked |
| `totpVerificationLimiter` | Failed TOTP codes per IP; a code that verifies ends the series | 5 per hour, then 30 minutes blocked |
| The TOTP account budget | Failed TOTP codes per account, whatever the IP | 5 per hour, then 30 minutes locked and a mail |
| `stepUpLimiter` | Failed second-factor checks on step-up, per account | 5 per hour, then 30 minutes blocked |
| `passkeyChallengeLimiter` | Passkey challenges per IP | 30 per 5 minutes |
| Every failure budget | Failures in 24 hours | 100, then three hours blocked |

Machine-facing rate limits: [Interoperability](./INTEROPERABILITY.md#quotas-and-limits).
