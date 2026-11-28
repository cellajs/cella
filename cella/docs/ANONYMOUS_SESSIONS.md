# Anonymous sessions

This document explains what an anonymous account is, how a server flow mints its session, what that session reaches and when the account goes.

### TL;DR

Someone can use the app before they have an identity, as in a demo. A server flow creates an account without one and signs the browser in with an anonymous session. That session reaches the tenants the flow made the account a member of and the routes about the account itself. The account goes at its sign-out or with its last tenant.

## Vocabulary

| Word | What it names |
| --- | --- |
| **Anonymous account** | An account without an identity: no proven address, no sign-in method, nothing that binds it to a person |
| **Anonymous session** | The one thing that signs an anonymous account in, minted by the server flow that created the account and expiring with whatever that flow set |
| **Visitor** | A request with no actor at all (`{ visitor: true }` in the permission engine) |
| **Demo** | The tenant kind and the feature |
| *Guest* | Only what the demo names the person |

## Minting

The template ships one flow that mints an anonymous account, the demo ([Multi-tenancy](./MULTI_TENANCY.md#tenant-kinds)). Your app may add others, such as trying the product before signing up or a kiosk mode.

`backend/src/modules/auth/core/anonymous/anonymous-account.ts`:

- `insertAnonymousUser(ctx, { id, name, slug })` inserts the `users` row under a placeholder address no mail reaches, `<id>@anonymous.invalid`, and no `emails` row.
- `startAnonymousSession(ctx, user, { expiresAt })` signs the browser in with the strategy `anonymous` until `expiresAt`, a week at most. An anonymous session always has an expiry: a demo's is its tenant's.

Only a server flow calls these. Your flow decides the name, the expiry and what the account is a member of. `createDemo` (`tenants/operations/create-demo.ts`) is the worked example: one transaction builds the account, a tenant of kind `demo`, its organization and the membership, then the app's `onDemoCreated` hooks run.

An LTI launch's first arrival is made with `insertAnonymousUser` too, beside an `lti` identity that signs it in again. It has no proven address either: the API serves it with `isAnonymous`, and the gate below refuses its embedded session, of method `lti`, as it refuses an anonymous one.

## What the API serves

The API never serves the placeholder address. `User.email` and `UserBase.email` are the proven address or `null`, and `User.isAnonymous` says why. A handler you add that returns a `User` reads `findServedUserById`, and a member list `memberSelect`.

The client keys on `isAnonymous`, never on the address, and treats a `null` address as absent: no `mailto:`, no prefilled form, no account to invite by.

## What a session reaches

An anonymous account is a member of what its flow made it a member of, and of nothing else. Its session's memberships bind it to those tenants, and `tenantGuard` keeps it there.

Every other route that authenticates a session, one with `userGuard` and no tenant guard, refuses an anonymous one with 403 `anonymous_session_restricted` unless the route carries `xAnonymous: true`, documented as `x-anonymous`. Whatever guards follow, the refusal is the same.

A route you add is refused until it says otherwise. You admit a route by this rule:

- A read about the account itself is admitted, since it answers nothing for an anonymous account (`getMe`, `listMyMemberships`, the stream, notifications).
- An action that binds, mails, connects or pushes is refused (invitations, `createTenant`, push, `deleteMe`).

Lasting access never depends on the route layer: whatever the routes say, an account without a proven address binds no invitation and accepts none (`isProvenAccount`, 403 `anonymous_account`).

## Lifecycle and limits

The session ends at its expiry or at its sign-out. A sign-out deletes the account at once, with an organization only it manages, as a demo's: nothing could sign it back in. Otherwise the account goes with the last tenant that held it (`removeDueTenants` removes the anonymous accounts a removed tenant leaves with no membership). An app's fixture account without an `emails` row follows the same rule.

Your flow limits its own minting: the demo has `appConfig.demo.perDay`, a per-address limiter and the bot check. Anonymous sessions together hold a tenth of the stream cap: throwaway accounts never crowd out a member's stream.

## An identity later

An app may let an anonymous account gain an identity and keep its work. The template ships no conversion, but the shape for one is set: proving an address on an anonymous account (an `emails` row through the usual verification, then a fresh session) turns `isAnonymous` false and the account into an ordinary one, with everything it made still its own.

A demo offers none of this on purpose: it stays the throwaway its tenant's removal takes along. For a "sign up to keep your work" flow, you build on that shape.
