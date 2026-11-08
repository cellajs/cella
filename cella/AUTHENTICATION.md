# Authentication

This document explains how people sign in and sign up, and the tokens, second factors and step-up behind it. It assumes you know WebAuthn: a passkey, its credential id and user verification ([W3C WebAuthn](https://www.w3.org/TR/webauthn/)).

### TL;DR

Nobody has a password. A person signs in with a magic link, a passkey or a provider account, and gets a session cookie
that holds a random token. Anything that must work once, such as an emailed link, is a token with one lifecycle.
Changing how an account is protected first asks the session to prove its user again.

## Sign-in methods

The sign-in page first asks whether the address is known. Only a browser that signed in to that account before learns the answer. Every other browser gets the same neutral step, account or not.

| Method | What proves the person |
| --- | --- |
| Magic link | The inbox: a link mailed to the address, opened in the browser that asked for it |
| Passkey | A WebAuthn passkey on the device |
| Provider sign-in | An account at GitHub, Google or Microsoft |
| Institutional sign-in | An account at the institution, asserted through an identity federation ([Institutional sign-in](./authentication/SSO.md)) |
| TOTP | A code from an authenticator app, as a second factor only |

`appConfig.enabledAuthStrategies` says which are on. A method that is off refuses its routes. A passkey or TOTP already set up can still be deleted.

A sign-in ends in a [session](./authentication/SESSIONS.md), after an MFA challenge when the account requires one. A provider or institutional sign-in starts a session of the app's own. Signing out at the provider or the institution ends nothing here. The app does not ask it again while the session lasts.

Microsoft sign-in can be narrowed to one Entra tenant.

From an address outside `SYSTEM_ADMIN_IP_ALLOWLIST`, a system administrator can neither sign in nor act as one.

The API reads the client address from the last `X-Forwarded-For` entry. It must run behind exactly one proxy that appends the connecting peer's address, as the template's load balancer does. Without such a proxy, a client can choose the address the allowlist and rate limits read.

## Sign-up

Sign-up needs open registration or a standing invitation, checked at the start and at completion. An account is identified by the proofs it holds, never by an address.

An account exists only once its inbox is proven. The account is created at the proof, with its address and its waiting invitations:

- **Magic link.** The click on a link to an unknown address.
- **Provider.** The same provider account signing in again, in the browser that opened a mail to its address.

Holding an invitation link proves nothing, since it can be forwarded:

- **Provider sign-up.** It skips the mail only when the provider hosts the address, as Google hosts Gmail. Elsewhere a provider's verified flag may predate a change of hands.
- **Accepting.** The account holds the invited address, or opens a link mailed to that inbox for this account.
- **Address stays off.** Accepting grants the membership and never adds the invited address to the account.
- **One disclosure.** Accepting tells a signed-in link holder whether another account holds that one address.

A provisional account is the exception to a proven inbox. An external party asserts its identity. Its placeholder address on a reserved domain has no inbox. The account of a [demo tenant](./MULTI_TENANCY.md#tenant-kinds) is one.

An address an external party asserts becomes proven only under its connection's address rule ([Institutional sign-in](./authentication/SSO.md)). No mailed link signs a provisional account in: it proves an inbox only from a signed-in session.

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

Opening a link only holds it in the browser. A mail scanner or a link preview does not use it up: a click on the app's page then redeems it with a POST.

The first redemption wins. The token then works for a short while in that browser alone, until that browser signs out. An opened magic link also goes when its account signs out anywhere, ends another session or turns MFA on. A token or code issued for a session serves that session alone and dies with it.

A magic link is the one link that redeems on opening, and only in the browser that asked for it. A crawler or a prefetch changes nothing: a cookie set at the request proves that browser.

A planted link signs nobody in: opened anywhere else, the link waits on a page that names the address. A link of another account than the signed-in one is refused. An expired link leads to a page that offers a new one.

## Second factors and MFA

MFA needs both a passkey and an authenticator app. When one is lost, the other still signs in.

A passkey sign-in needs no challenge. A passkey proves both factors itself, since every passkey registration and sign-in requires user verification. Any other sign-in of such an account issues a `confirm-mfa` challenge. Only a passkey or an authenticator code completes it.

Setting up a factor or connecting a provider sends a security mail to the account's address.

The tenant's sign-in policy and step-up read the sign-in method and factor that the session records. In NIST SP 800-63B terms a magic link is a recovery link, not an authenticator. An account that needs AAL2 turns MFA on.

- **One-time challenge.** A passkey challenge serves one purpose and answers at most once.
- **Random, unstored user handle.** A sign-in finds the account by its credential id.
- **Unknown passkeys.** A distinct refusal for them reveals no account, since a passkey names no address.
- **No framed ceremony.** The frontend refuses to be framed by another origin.
- **TOTP secret.** It is encrypted at rest under `DATA_ENCRYPTION_KEY`.
- **Shared TOTP lockout.** Failed codes lock the account's TOTP in every process.

## Step-up

An account-security action needs a session that proved its user present within the last ten minutes. A step-up also sets a cookie of its own. Only a browser holding it counts as stepped up. A session cookie copied before the proof stays unproven. How much proof an action asks depends on what it does:

| Action | Holds a passkey or TOTP | No factor, recent sign-in | No factor, older sign-in |
| --- | --- | --- | --- |
| Mint an API key, create or re-enable a service account, consent to an OAuth client | factor | set up a factor | set up a factor |
| Set up a passkey or authenticator app, connect a provider, end another session, delete the account | factor | passes | emailed code |
| Delete a passkey or the authenticator app, turn MFA on or off | factor | | |

- **Factor**: a passkey or TOTP proven on this session within the window, by sign-in, step-up or setup.
- **SSO factor**: an SSO sign-in counts when the institution asserted MFA within the window.
- **Set up a factor**: the dialog adds a passkey or authenticator app, then runs the action.
- **Emailed code**: mailed for this session and typed into the same dialog. Any device can read the mail.
- **Not a factor**: an emailed code is only as strong as the mailbox. Its misses are capped per day only.
- **A lost factor**: an emailed code may set up a new one, since with MFA off the mailbox signs in anyway.
- **With MFA on**: the other factor replaces the lost one.

On the frontend, wrap the action in `withStepUp(action)`. On a `step_up_required` refusal it opens the "Confirm it's you" dialog and runs the action once more.

Signing out, revoking a key or a connected app, disabling a service account and leaving an organization need no step-up.

## Rate limits

Every read runs through a default limiter, keyed per user or service account, or per IP address when anonymous. A route that declares its own limiter replaces it. A write declares one in `xRateLimiter`.

The OpenAPI docs show each limiter with its budget. A refusal is a 429 with `Retry-After`. The default read limiter also reports what is left of its budget in `RateLimit` header fields.

- **Keyed pseudonyms.** An IP or email address enters a key as a keyed pseudonym, never in the clear.
- **Shared counts.** Processes share counts. While the database is unreachable, each process counts on its own.
- **Lost on a crash.** A database crash or failover clears every count.

Mail and failed proofs carry limits of their own:

- **Typed addresses.** A mail to an address someone else typed is also capped per address.
- **Failed proofs.** They count per client address even for a signed-in user. Failed second factors also count per account.
- **Daily tier.** Every failure budget also has one, which slows a patient guesser.
- **Weeks for second factors.** Their failures also count over weeks. A correct code never resets that count.
- **Self-lifting block.** It lifts once the weeks pass, where NIST SP 800-63B disables the authenticator.
