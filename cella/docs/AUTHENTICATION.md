# Authentication

This document explains how people sign in and sign up, and the tokens, [passkeys](https://www.w3.org/TR/webauthn/), second factors, step-up and rate limits behind it.

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

You turn methods on in `appConfig.enabledAuthStrategies` and can narrow Microsoft sign-in to one Entra tenant. A method that is off refuses its routes. A passkey or TOTP already set up can still be deleted.

The sign-in page first asks for the address. A browser that signed in to that account before goes on to sign in. Every other browser sees the same page, account or not: the link, if any, arrives by mail.

A sign-in ends in a [session](./authentication/SESSIONS.md), after an MFA challenge when the account requires one. A provider or institutional sign-in starts a session of the app's own. Signing out at the provider or the institution ends nothing here.

From an address outside `SYSTEM_ADMIN_IP_ALLOWLIST`, a system administrator can neither sign in nor act as one.

Run the API behind exactly one proxy that appends the connecting peer's address, as the template's load balancer does. Without such a proxy, a client can choose the address the allowlist and rate limits read.

## Sign-up

An account exists only once its inbox is proven. An account is identified by the proofs it holds, never by an address. Sign-up needs open registration or a standing invitation, checked at the start and at completion.

The account is created at the proof, with its address and its waiting invitations:

- **Magic link.** The click on a link to an unknown address.
- **Provider.** The same provider account signing in again, in the browser that opened a mail to its address.

An address an external party asserts becomes proven only under its connection's address rule ([Institutional sign-in](./authentication/SSO.md)).

Holding an invitation link proves nothing, since it can be forwarded:

- **Provider sign-up.** It skips the mail only when the provider hosts the address, as Google hosts Gmail.
- **Accepting.** The account holds the invited address, or opens a link mailed to that inbox for this account.
- **Address stays off.** Accepting grants the membership and never adds the invited address to the account.
- **One disclosure.** Accepting tells a signed-in link holder whether another account holds that one address.
- **Landing.** An accept opens the channel joined, from the sign-in that accepts a followed link and from the Accept button alike.

Say a person signed in to a work account opens an invitation sent to their personal address. The accept is refused until they open a new link, mailed to that address for the work account. The personal address stays off the work account.

An anonymous account is the exception to a proven inbox: it has no identity at all. The account of a [demo tenant](./MULTI_TENANCY.md#tenant-kinds) is one. Only the [anonymous session](./ANONYMOUS_SESSIONS.md) minted for it signs it in, never a mailed link: an address is proven only from a signed-in session.

## Tokens

A token is anything that must work once. The `auth/core/tokens/` module issues, opens and spends every token, with one policy per kind. Only a hash is stored. The raw value exists only in the link, the cookie or the mailed code that carries it.

| Kind | Carried in | What it is for | Expires after |
| --- | --- | --- | --- |
| `magic` | link | Signing in or up through the inbox | minutes |
| `invitation` | link | Joining the channel it invites to | a week |
| `oauth-verification` | link | Proving the address of a provider sign-up | hours |
| `confirm-mfa` | cookie | The MFA challenge between the first proof and the session | minutes |
| `oauth-connect` | cookie | Connecting a provider account to the signed-in account | minutes |
| `step-up` | code | Proving presence again with an emailed code | minutes |

Seven rules decide what opening a link does:

- Opening a link only holds it in the browser. A click on the app's page then redeems it with a POST: a mail scanner or a link preview does not use it up.
- A magic link is the one link that redeems on opening, and only in the browser that asked for it.
- A planted link signs nobody in: opened anywhere else, the link waits on a page that names the address.
- The first redemption wins. The token then works for a short while in that browser alone.
- A magic link signs in once, and its sign-in spends it: a second click, or a second factor that failed, needs a new link.
- A link of another account than the signed-in one is refused.
- An expired link leads to a page that offers a new one.

A token or code issued for a session serves that session alone and dies with it.

## Second factors and MFA

With MFA on, the inbox or a provider account alone no longer signs in. MFA needs both a passkey and an authenticator app. When one is lost, the other still signs in.

A passkey sign-in needs no challenge. A passkey proves both factors itself: every passkey registration and sign-in requires user verification. Any other sign-in of such an account issues a `confirm-mfa` challenge. Only a passkey or an authenticator code completes it.

Setting up a factor or connecting a provider sends a security mail to the account's address.

In NIST SP 800-63B terms a magic link is a recovery link, not an authenticator. An account that needs AAL2 turns MFA on.

Five rules protect the factors:

- **One-time challenge.** A passkey challenge serves one purpose and answers at most once.
- **Random, unstored user handle.** A sign-in finds the account by its credential id.
- **Unknown passkeys.** A distinct refusal for them reveals no account, since a passkey names no address.
- **No framed ceremony.** The frontend refuses to be framed by another origin.
- **TOTP secret.** It is encrypted at rest under `DATA_ENCRYPTION_KEY`.

## Step-up

An action that changes the account or hands out lasting access needs a session that proved its user present within the last ten minutes. A step-up also sets a cookie of its own. Only a browser holding it counts as stepped up. A session cookie copied before the proof stays unproven.

How much proof an action asks depends on what it does:

| Action | Holds a passkey or TOTP | No factor, recent sign-in | No factor, older sign-in |
| --- | --- | --- | --- |
| Mint an API key, create or re-enable a service account, consent to an OAuth client | factor | set up a factor | set up a factor |
| Set up a passkey or authenticator app, connect a provider, end another session, delete the account | factor | passes | emailed code |
| Delete a passkey or the authenticator app, turn MFA on or off | factor | | |

- **Factor**: a passkey or TOTP proven on this session within the window.
- **SSO factor**: an SSO sign-in counts when the institution asserted MFA within the window.
- **Set up a factor**: the dialog adds a passkey or authenticator app, then runs the action.
- **Passes**: the recent sign-in suffices.
- **Emailed code**: mailed for this session and typed into the same dialog. Any device can read the mail.

An emailed code is no factor: it is only as strong as the mailbox. With MFA off, it may set up a new factor after one is lost: the mailbox signs in anyway. With MFA on, the other factor replaces the lost one.

On the frontend, wrap the action in `withStepUp(action)`. On a `step_up_required` refusal it opens the "Confirm it's you" dialog and runs the action once more.

Acts that only take access away need no step-up: signing out, revoking a key or a connected app, disabling a service account and leaving an organization.

A system administrator recovers another account from the users table, with a step-up of their own: sign the person out everywhere, or remove every passkey or the authenticator app they lost. MFA turns off when a required method is gone. The person is mailed about each act.

## Module boundary

The auth module keeps what every sign-in relies on apart from the sign-in methods, in three folders:

- `core/`: sessions, tokens and step-up.
- `flows/`: the sign-in methods.
- `account/`: the account page.

To use another authenticator, you replace `flows/` and exchange its proof for a session through `setUserSession`. `core/index.ts` names what the rest of the app may import, and `backend/tests/auth-boundary.test.ts` holds three rules:

- Outside code imports the index only.
- The core imports no flow but the one read of the factors a user holds.
- The tokens module has an opener for every link kind. A flow registers its link kinds with `registerLinkHandler` when its handlers load.

Every sign-in that ends in a redirect (magic link, provider, SSO) goes through `finishSignIn`, whose extras report the proof: a second factor already proven skips the app's own challenge. Every account comes from `createAccount`, under the id another party named the person by when one did.

Accounts are portable. `pnpm --filter backend auth:export` writes every account with a proven address in the import shape of [Hanko](https://docs.hanko.io): its addresses, passkeys and authenticator secret. The file holds decrypted secrets and goes where database dumps go.

## Rate limits

Rate limits slow down heavy use and guessing. Every read runs through a default limiter, keyed per user or service account, or per IP address when anonymous. You declare a route's limiter in `xRateLimiter`: a write declares one, and on a read it replaces the default. A range read that takes a [shared answer](./SYNC_ENGINE.md#shared-answers) spends nothing.

The OpenAPI docs show each limiter with its budget. A refusal is a 429 with `Retry-After`. The default read limiter also reports what is left of its budget in `RateLimit` header fields.

- **Keyed pseudonyms.** An IP or email address enters a key as a keyed pseudonym, never in the clear.
- **Shared counts.** Processes share counts. While the database is unreachable, each process counts on its own.
- **Lost on a crash.** A database crash or failover clears every count.

Mail and failed proofs carry limits of their own:

- **Typed addresses.** A mail to an address someone else typed is also capped per address.
- **Failed proofs.** They count per client address even for a signed-in user. Failed second factors also count per account.
- **Daily tier.** Every failure budget also has one, which slows a patient guesser.
- **Weeks for TOTP.** Its failures also count over weeks. A correct code never resets that count.
- **Self-lifting block.** It lifts once the weeks pass, where NIST SP 800-63B disables the authenticator.
