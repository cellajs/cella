# Authentication

This document explains how people sign in and sign up, and the tokens, second factors and step-up behind it.

### TL;DR

Nobody has a password. A person proves an inbox with a magic link, a device with a passkey, or an account at a
provider, and gets a session whose cookie holds a random token while the database holds only its hash. Everything
that must work once, such as an emailed link or a second-factor challenge, is a token with one lifecycle, and the
actions that change how an account is protected first ask the session to prove its user again.

## Sign-in methods

| Method | What proves the person |
| --- | --- |
| Magic link | The inbox: a link mailed to the address, opened in the browser that asked for it |
| Passkey | A WebAuthn passkey on the device |
| Provider sign-in | An account at GitHub, Google or Microsoft |
| Institutional sign-in | An account at the institution, asserted through an identity federation ([Institutional sign-in](./authentication/SSO.md)) |
| TOTP | A code from an authenticator app; a second factor only, never a first |

Each method is a sub-module of `backend/src/modules/auth/`, and `appConfig.enabledAuthStrategies` says which are on. A method that is off refuses its routes, except deleting a passkey or TOTP already set up. The sign-in page first asks whether the address is known, and learns it only in a browser that signed in to that account before. Every other browser gets the neutral sign-in step, whether or not the address has an account.

A magic-link or provider sign-in ends in a [session](./authentication/SESSIONS.md), or first in an MFA challenge when the account requires one. A provider or institutional sign-in starts a session of the app's own: signing out at the provider or the institution ends nothing here, and the app does not ask it again while the session lasts. A passkey sign-in sets the session at once. A system administrator signs in, and counts as one, only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST` (none when unset, this machine in the development `.env`). The API reads the client address from the last `X-Forwarded-For` entry, so it must run behind exactly one proxy that appends the connecting peer to that header, as the template's load balancer does. An app behind no proxy, or one that passes the client's header through, lets a client choose the address its allowlist and rate limits read.

## Sign-up

An account exists only once its inbox is proven. The account, its proven address and its waiting invitations are created together, so no unproven account ever holds an address.

- **Magic link.** A link to an unknown address names no user. The account is created when the link is clicked.
- **Provider.** A provider sign-up waits on a verification mail to the provider's address. The account is created when the same provider account signs in again in the browser that opened the mail.
- **Invitation.** An invitation link can be forwarded, so an invitee skips that mail only when the provider verified the invited address itself. An account accepts an invitation once it holds the invited address, or through a link mailed to that inbox for this account. A magic-link sign-in to the invited address, in the browser that opened the invitation link and on an account without MFA, accepts it at once; an invitation the account claims by its address alone waits for an answer in the app. Accepting grants the membership and never adds the invited address to the accepting account. Accepting tells a signed-in holder of the link whether another account holds the invited address, for that one address only: it refuses when one does and asks to confirm the address when none does.
- **Who may sign up.** Open registration or a standing invitation, checked at the start and at completion. While registration is closed, a provider sign-up on an address the provider did not verify starts from the invitation link only.

An account is identified by the proofs it holds (`identities`, `emails`), never by an address.

## Tokens

One module, `auth/tokens/`, issues, opens and spends every token, with one policy per type. Only a hash is stored; the raw value exists only in the link, the cookie or the mailed code that carries it.

| Type | Carrier | Used for | Lives |
| --- | --- | --- | --- |
| `magic` | link | Signing in or up through the inbox | minutes |
| `invitation` | link | Joining the channel it invites to | a week |
| `oauth-verification` | link | Proving the address of a provider sign-up | hours |
| `confirm-mfa` | cookie | The MFA challenge between the first proof and the session | minutes |
| `oauth-connect` | cookie | Connecting a provider account to the signed-in account | minutes |
| `step-up` | code | Proving presence again with an emailed code | minutes |

Opening a link only holds it in the browser, and a click on the app's page that opening leads to redeems it with a form post, so a link a mail scanner or a link preview fetches is not used up. The first redemption wins, and the token then works for a short while in that browser alone, until that browser signs out. An opened magic link also goes when its account signs out anywhere, ends another session or turns MFA on. A token or code issued for a session serves that session alone and dies with it.

A magic link is the one link that redeems on opening, and only in the browser that asked for it, which a cookie set at the request proves: a crawler or a prefetch holds no such cookie and changes nothing. Opened anywhere else, the link waits on a page that names the address, so a link planted in someone's browser signs nobody in. A link of another account than the one signed in is refused, and an expired one leads to an error page that offers a new link.

## Second factors and MFA

A passkey challenge serves one purpose (registration, sign-in, MFA or step-up) and answers at most once. A passkey's user handle is random per registration and not stored: a sign-in finds the account by the passkey's credential id, which no two accounts share. A sign-in answers an unknown passkey apart from a bad signature, which tells nothing about accounts, since it names no address. Passkey ceremonies never run in a frame: the frontend answers `X-Frame-Options: DENY`, so no response the backend verifies comes from a cross-origin frame. A TOTP secret is encrypted at rest under `DATA_ENCRYPTION_KEY`. Failed codes lock the account's TOTP in every process; while the database cannot record them each process counts them alone, and a database crash or failover clears the count.

MFA needs both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in. A magic-link, provider or institutional sign-in of such an account issues a `confirm-mfa` challenge, which only a passkey or an authenticator code completes. A passkey sign-in needs none: the passkey must verify its user with a PIN or biometric, at registration and at every sign-in, so it proves both factors itself. The session records the sign-in method and the factor, which the tenant's sign-in policy and step-up read. A magic link is an emailed recovery link in NIST SP 800-63B terms, not an authenticator: an account that needs AAL2 turns MFA on, after which a magic link only starts the challenge a passkey or authenticator code completes.

Setting up a factor or connecting a provider sends a security mail to the account's address.

## Step-up

An account-security action needs more than a session: the session must have proven its user present within the last ten minutes. A step-up also sets a cookie of its own, and only a browser holding it counts as stepped up, so a copy of the session cookie taken before the proof stays unproven. How much proof an action asks depends on what it does:

| Action | Holds a passkey or TOTP | No factor, recent sign-in | No factor, older sign-in |
| --- | --- | --- | --- |
| Mint an API key, create or re-enable a service account, consent to an OAuth client | factor | set up a factor | set up a factor |
| Set up a passkey or authenticator app, connect a provider, end another session, delete the account | factor | passes | emailed code |
| Delete a passkey or the authenticator app, turn MFA on or off | factor | | |

Signing out, revoking a key or a connected app, disabling a service account and leaving an organization need no step-up.

- **Factor**: a passkey or TOTP the user holds, proven on this session within the window: by a step-up, by setting it up, or by the MFA or passkey sign-in that started the session. An SSO sign-in counts as a factor when the institution asserted MFA.
- **Set up a factor**: the dialog offers to add a passkey or an authenticator app. Setting it up proves it on the session, so the action runs right after.
- **Emailed code**: mailed to the account's address for the session that asked and typed into the same dialog, so it works when the mail is read on a phone or in another browser. It is as strong as the mailbox and no second factor: wrong codes are capped per day, and the count starts again after each block, so the failures are never capped in total.
- **A lost factor**: with MFA off the mailbox signs the account in anyway, so a user who lost their passkey or authenticator may set up a new one with an emailed code. The code opens nothing else. With MFA on the other factor replaces the lost one.

On the frontend, wrap the action in `withStepUp(action)`: on a `step_up_required` refusal it opens the "Confirm it's you" dialog and runs the action once more.

## Rate limits

Every read is paced per user or service account, or per IP address when anonymous, unless its route declares a limiter of its own; a write declares one in `xRateLimiter`. The OpenAPI docs show each limiter with its budget, read from the limiter itself. An IP or email address enters a limiter's key as a keyed pseudonym, so `rate_limits` holds neither in the clear. Counts are shared across processes, except while the limiter's database statements fail: each process then counts alone in its memory. A refusal is a 429 with `Retry-After`.

Mail routes count their sends per user, or per IP when anonymous. A mail to an address someone else typed is also capped per address: a sign-in link, a request-form reply and, per tenant, an invitation; a tenant's invitations also have a daily total, a tenant restriction a system admin can raise. Security-inbox alerts that any signed-in user can raise are capped per user and in total. Address lookups and passkey challenges count per IP. Failed proofs count per client address, and failed second factors also per account, so changing IP does not help a guesser on the template's load balancer; the per-account count holds anywhere. Every failure budget also has a daily tier, which slows a patient guesser. Failed second factors count over weeks as well, and a correct code does not reset that count, so a guesser runs out of tries long before a code is likely to match. Their block lifts on its own once the weeks pass, where NIST SP 800-63B disables the authenticator until it is set up again.
