# Authentication

This document explains how people sign in and sign up, and the tokens, second factors and step-up behind it. It assumes you know WebAuthn: a passkey, its credential id and user verification ([W3C WebAuthn](https://www.w3.org/TR/webauthn/)).

### TL;DR

Nobody has a password. A person signs in with a magic link, a passkey or a provider account, and gets a session cookie
that holds a random token. Anything that must work once, such as an emailed link, is a token with one lifecycle.
Changing how an account is protected first asks the session to prove its user again.

## Sign-in methods

| Method | What proves the person |
| --- | --- |
| Magic link | The inbox: a link mailed to the address, opened in the browser that asked for it |
| Passkey | A WebAuthn passkey on the device |
| Provider sign-in | An account at GitHub, Google or Microsoft |
| Institutional sign-in | An account at the institution, asserted through an identity federation ([Institutional sign-in](./authentication/SSO.md)) |
| TOTP | A code from an authenticator app, as a second factor only |

Each method is a sub-module of `backend/src/modules/auth/`. `appConfig.enabledAuthStrategies` says which are on. A method that is off refuses its routes, except deleting a passkey or TOTP already set up. The sign-in page first asks whether the address is known. Only a browser that signed in to that account before learns the answer. Every other browser gets the same neutral step, account or not.

`MICROSOFT_TENANT_ID` can narrow Microsoft sign-in to `organizations`, `consumers` or one tenant's GUID. A tenant's domain name there fails every sign-in, since tokens name the tenant by its GUID.

A sign-in ends in a [session](./authentication/SESSIONS.md), after an MFA challenge when the account requires one. A provider or institutional sign-in starts a session of the app's own. Signing out at the provider or the institution ends nothing here. The app does not ask it again while the session lasts.

A system administrator signs in, and counts as one, only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST`. The API reads the client address from the last `X-Forwarded-For` entry. It must run behind exactly one proxy that appends the connecting peer's address, as the template's load balancer does. Behind no proxy, or one that passes the client's header through, a client chooses the address the allowlist and rate limits read.

## Sign-up

An account exists only once its inbox is proven. The account is created at the proof, with its address and its waiting invitations:

- **Magic link.** The click on a link to an unknown address.
- **Provider.** The same provider account signing in again, in the browser that opened a mail to its address.

Sign-up needs open registration or a standing invitation, checked at the start and at completion. An account is identified by the proofs it holds, never by an address.

An invitation link can be forwarded, so holding one proves nothing:

- **Provider sign-up.** It skips the mail only when the provider hosts the address, as Google hosts Gmail.
- **Accepting.** The account holds the invited address, or opens a link mailed to that inbox for this account.
- **Address stays off.** Accepting grants the membership and never adds the invited address to the account.
- **One disclosure.** Accepting tells a signed-in link holder whether another account holds that one address.

A provisional account is the exception to a proven inbox. An external party asserts its identity. Its placeholder address on a reserved domain has no inbox. The account of a [demo tenant](./MULTI_TENANCY.md#tenant-kinds) is one. An address an external party asserts becomes proven only under its connection's address rule ([Institutional sign-in](./authentication/SSO.md)). A provisional account proves an inbox only from a signed-in session, so no mailed link signs it in.

## Tokens

The `auth/tokens/` module issues, opens and spends every token, with one policy per kind. Only a hash is stored. The raw value exists only in the link, the cookie or the mailed code that carries it.

| Kind | Carrier | Used for | Lives |
| --- | --- | --- | --- |
| `magic` | link | Signing in or up through the inbox | minutes |
| `invitation` | link | Joining the channel it invites to | a week |
| `oauth-verification` | link | Proving the address of a provider sign-up | hours |
| `confirm-mfa` | cookie | The MFA challenge between the first proof and the session | minutes |
| `oauth-connect` | cookie | Connecting a provider account to the signed-in account | minutes |
| `step-up` | code | Proving presence again with an emailed code | minutes |

Opening a link only holds it in the browser. A click on the app's page then redeems it with a POST, so a mail scanner or a link preview does not use it up. The first redemption wins. The token then works for a short while in that browser alone, until that browser signs out. An opened magic link also goes when its account signs out anywhere, ends another session or turns MFA on. A token or code issued for a session serves that session alone and dies with it.

A magic link is the one link that redeems on opening, and only in the browser that asked for it. A cookie set at the request proves that browser, so a crawler or a prefetch changes nothing. Opened anywhere else, the link waits on a page that names the address, so a planted link signs nobody in. A link of another account than the signed-in one is refused. An expired link leads to a page that offers a new one.

## Second factors and MFA

- **One-time challenge.** A passkey challenge serves one purpose and answers at most once.
- **Random, unstored user handle.** A sign-in finds the account by its credential id.
- **Unknown passkeys.** A distinct refusal for them reveals no account, since a passkey names no address.
- **No framed ceremony.** The frontend refuses to be framed by another origin.
- **TOTP secret.** It is encrypted at rest under `DATA_ENCRYPTION_KEY`.
- **Shared TOTP lockout.** Failed codes lock the account's TOTP in every process.

MFA needs both a passkey and an authenticator app. When one is lost, the other still signs in. A passkey sign-in needs no challenge. Every passkey registration and sign-in requires user verification, so a passkey proves both factors itself. Any other sign-in of such an account issues a `confirm-mfa` challenge. Only a passkey or an authenticator code completes it. The tenant's sign-in policy and step-up read the sign-in method and factor that the session records. In NIST SP 800-63B terms a magic link is a recovery link, not an authenticator. An account that needs AAL2 turns MFA on.

Setting up a factor or connecting a provider sends a security mail to the account's address.

## Step-up

An account-security action needs a session that proved its user present within the last ten minutes. A step-up also sets a cookie of its own. Only a browser holding it counts as stepped up, so a session cookie copied before the proof stays unproven. How much proof an action asks depends on what it does:

| Action | Holds a passkey or TOTP | No factor, recent sign-in | No factor, older sign-in |
| --- | --- | --- | --- |
| Mint an API key, create or re-enable a service account, consent to an OAuth client | factor | set up a factor | set up a factor |
| Set up a passkey or authenticator app, connect a provider, end another session, delete the account | factor | passes | emailed code |
| Delete a passkey or the authenticator app, turn MFA on or off | factor | | |

Signing out, revoking a key or a connected app, disabling a service account and leaving an organization need no step-up.

- **Factor**: a passkey or TOTP proven on this session within the window, by sign-in, step-up or setup.
- **SSO factor**: an SSO sign-in counts when the institution asserted MFA within the window.
- **Set up a factor**: the dialog adds a passkey or authenticator app, and the action runs right after.
- **Emailed code**: mailed for this session and typed into the same dialog, so any device can read the mail.
- **Not a factor**: an emailed code is as strong as the mailbox, and its misses are capped per day only.
- **A lost factor**: with MFA off the mailbox signs in anyway, so an emailed code may set up a new one.
- **With MFA on**: the other factor replaces the lost one.

On the frontend, wrap the action in `withStepUp(action)`. On a `step_up_required` refusal it opens the "Confirm it's you" dialog and runs the action once more.

## Rate limits

Every read is paced per user or service account, or per IP address when anonymous. A route that declares a limiter of its own skips that pace. A write declares one in `xRateLimiter`. The OpenAPI docs show each limiter with its budget. A refusal is a 429 with `Retry-After`. The read pace also reports what is left of its budget in `RateLimit` header fields.

- **Keyed pseudonyms.** An IP or email address enters a key as a keyed pseudonym, never in the clear.
- **Shared counts.** Processes share counts, except while the database is unreachable.
- **Lost on a crash.** A database crash or failover clears every count.

Mail and failed proofs carry limits of their own:

- **Mail.** Sends count per user, or per IP when anonymous.
- **Typed addresses.** A mail to an address someone else typed is also capped per address.
- **Failed proofs.** They count per client address, and failed second factors per account too.
- **Daily tier.** Every failure budget also has one, which slows a patient guesser.
- **Weeks for second factors.** Their failures also count over weeks, and a correct code never resets that.
- **Self-lifting block.** It lifts once the weeks pass, where NIST SP 800-63B disables the authenticator.
