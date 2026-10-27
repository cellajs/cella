# Authentication

This document explains how people sign in and sign up, and the tokens, second factors and step-up behind it.

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
| Institutional sign-in | An account at the institution, asserted through an identity federation ([Institutional sign-in](./authentication/SSO.md)) | `auth/sso/` |
| TOTP | A code from an authenticator app; a second factor only, never a first | `auth/totps/` |

`appConfig.enabledAuthStrategies` says which methods are on. A route of a method that is off refuses before its guards run; deleting a passkey or TOTP stays reachable. The sign-in page first asks whether the address is known, and learns it only in a browser that signed in to that account before. Every other browser gets the neutral sign-in step, whether or not the address has an account.

A magic-link or provider sign-in ends in a [session](./authentication/SESSIONS.md), or first in an MFA challenge when the account requires one. A passkey sign-in sets the session at once. A system administrator signs in, and counts as one, only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST`, which defaults to `none`.

## Sign-up

An account exists only once its inbox is proven:

- **One transaction.** The user, its verified email row and the invitations waiting for the address are created together, so no unproven account ever holds an address.
- **Magic link.** A link to an unknown address names no user. The account is created when the link is clicked.
- **Provider.** A provider sign-up waits on a verification mail to the provider's address. The account is created when the same provider account signs in again in the browser that opened the mail.
- **Invitation.** An invitee skips that mail only when the provider itself verified the invited address: an invitation link can be forwarded, so the opened link and the provider's verification prove the inbox together. A link not yet bound to an account opens for whoever is signed in, and that account accepts it only once it holds the invited address: an account on another address asks for a link to the invited inbox, bound to the account, and opening it there adds the address.
- **Who may sign up.** Open registration, or an invitation that still stands. It is asked at the start of a sign-up and again at its completion, since either may have changed in between.

An account is identified by the proofs it holds (`identities`, `emails`), never by an address: [Architecture](./ARCHITECTURE.md#trust-boundaries).

## Tokens

One module, `auth/tokens/`, issues, opens and spends every token. `tokens.secret` stores a hash of the raw value, which exists only in the link, the cookie or the mailed code that carries it. `tokenPolicies` declares one policy per type in `appConfig.tokenTypes`:

| Type | Carrier | Lives | Replaces earlier tokens of | A link without an account belongs to |
| --- | --- | --- | --- | --- |
| `magic` | link | 15 minutes, then 5 minutes single-use | the address or the account | the address's holder, else a new account |
| `invitation` | link | 7 days, then 30 minutes | the invitation | whoever is signed in, accepted once their account holds the address |
| `oauth-verification` | link | 2 hours, then 5 minutes | the identity | the address's holder, else a new account |
| `confirm-mfa` | cookie | 10 minutes | nothing | |
| `oauth-connect` | cookie | 10 minutes | the account | |
| `step-up` | code | 10 minutes | the session | |

Opening a link redeems it: the first redemption wins, the token's lifetime becomes its single-use window, and the browser gets a cookie that binds the token to it. A bound token is spent once, so of two concurrent completions one passes. A token issued for a session serves that session alone and dies with it. Each link type has its handler in `linkHandlers`; a type without one does not compile. A code is looked up by the session that enters it, never by its value, so a guess can only ever match that session's own code; a wrong one leaves it for the next try.

A magic link signs in directly only in the browser that asked for it. Opened anywhere else, the link is held and the holder confirms on a page that names the address: a link planted in someone's browser, or fetched by a mail scanner, signs nobody in and is not used up. A link of another account than the one signed in is refused, and an expired one leads to an error page that offers a new link.

## Second factors and MFA

A passkey challenge is issued for one purpose (registration, sign-in, MFA or step-up) and, for the last two, for one account. The browser holds it in a signed cookie and the database holds its hash. Verifying a response deletes the challenge first, so it answers one ceremony of its purpose at most once. A signature counter only moves forward, and a credential id names one account.

A TOTP secret is encrypted at rest under `DATA_ENCRYPTION_KEY`. A code verifies within a minute of now and counts once. Every check draws on the account's failure budget, whatever the IP ([Rate limits](#rate-limits)), and the lockout lives in the database, so every process honours it.

MFA (`users.mfaRequired`) needs both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in. A sign-in of such an account issues a `confirm-mfa` challenge that carries the method the sign-in started with. Completing it is the only way in: the offered factor is verified for the challenge's account, the challenge is spent, and the session records that method and the factor as its step-up, so a tenant's sign-in policy and the step-up window read the same row.

## Step-up

An account-security action needs more than a session: the session must have proven its user present within the last ten minutes, and an impersonation never does. How much proof an action asks depends on what it does:

| Action | Holds a passkey or TOTP | No factor, signed in < 10 min ago | No factor, later |
| --- | --- | --- | --- |
| Mint an API key, create or re-enable a service account, consent to an OAuth client | factor | set up a factor | set up a factor |
| Set up a passkey or authenticator app, connect a provider, delete the account | factor | passes | emailed code |
| Delete a passkey or the authenticator app, turn MFA on or off | factor | | |
| Revoke a key, a session or a connected app, disable a service account, leave an organization | passes | passes | passes |

- **Factor**: a passkey or TOTP the user holds, proven on this session within the window by a step-up, by setting it up, by the MFA completion that started the session or by a passkey sign-in. An SSO sign-in counts as a factor when the institution asserted MFA (the federation's `mfaAcr`), for every row.
- **Set up a factor**: the dialog offers to add a passkey or an authenticator app, which follows the second row. Setting it up proves it on the session, so the action runs right after. An app with neither method on treats the first row like the second.
- **Emailed code**: six digits, mailed to the account's address for the session that asked and typed into the same dialog, so it works when the mail is read on a phone or in another browser. A new code replaces the last one, a wrong one draws on the step-up budget ([Rate limits](#rate-limits)). The mail names the browser that asked and keeps the code out of its subject.
- **A lost factor**: with MFA off the mailbox signs the account in anyway, so a user who lost their passkey or authenticator may set up a new one with an emailed code. The code opens nothing else. With MFA on the other factor replaces the lost one.

The refusal is 403 `step_up_required` with what the user can offer in `meta.methods`. On the frontend, `withStepUp(action)` runs the action, opens the "Confirm it's you" dialog on that refusal and runs the action once more. Setting up a factor and connecting a provider each send a security mail to the account's address.

## The authorization server

The OAuth face keeps a browser session of its own, which signing out, ending one's other sessions and turning MFA on end as well: [OAuth worker](../oauth/README.md#clients-and-consent). Tokens, scopes and consent: [Interoperability](./INTEROPERABILITY.md#face-oauth).

## Rate limits

Routes declare their limiter in `xRateLimiter`, which appears in OpenAPI. A limiter keys its counts by IP (an IPv6 client by its `/64`), email, user, actor or tenant, and an IP or address enters the key as a keyed pseudonym, so `rate_limits` holds neither in the clear. Counts are shared across processes, with process memory as the fallback while PostgreSQL is away. A refusal is `429 too_many_requests` with `Retry-After`.

A limiter either counts every request and refuses a spent key until its window ends (an hour for a budget, minutes to pace a route whose client retries), or counts by outcome: successes, failures, or a series of failures that a success ends. Counting by outcome reserves an attempt before the handler runs and returns it unless the outcome counts, so parallel requests cannot exceed a budget.

| Limiter | Counts | Budget |
| --- | --- | --- |
| `magicLinkLimiter` | Magic links per address, asked for by browsers that never signed in to its account | 3 per 30 minutes |
| `emailEnumLimiter` | Address lookups per IP, hits included | 30 per hour |
| `spamLimiter` | Mails sent per user, per IP when anonymous | 10 per hour |
| `tokenLimiter` | Failed link, callback and passkey sign-ins per IP; a success ends the series | 10, then 30 minutes blocked |
| `totpVerificationLimiter` | Failed TOTP codes per IP; a code that verifies ends the series | 5 per hour, then 30 minutes blocked |
| The TOTP account budget | Failed TOTP codes per account, whatever the IP | 5 per hour, then 30 minutes locked and a mail |
| `stepUpLimiter` | Failed step-up proofs (a factor or an emailed code), per account | 5 per hour, then 30 minutes blocked |
| `passkeyChallengeLimiter` | Passkey challenges per IP | 30 per 5 minutes |
| Every failure budget | Failures in 24 hours | 100, then three hours blocked |

Machine-facing rate limits: [Interoperability](./INTEROPERABILITY.md#quotas-and-limits).
