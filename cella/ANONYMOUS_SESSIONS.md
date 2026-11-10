# Anonymous sessions

An anonymous account is an account without an identity: no proven address, no sign-in method, nothing that binds it to a person. An anonymous session is the one thing that signs it in, minted by the server flow that created the account and expiring with whatever that flow set.

The template ships one such flow, the demo ([Multi-tenancy](./MULTI_TENANCY.md#tenant-kinds)); an app may add others: trying the product before signing up, a visitor keeping state on a public board or form, a kiosk or event mode, an API playground, onboarding before the account exists.

One word per layer: **anonymous** is the account and its session, **visitor** a request with no actor at all (`{ visitor: true }` in the permission engine), **demo** the tenant kind and the feature, and *Guest* only what the demo names the person.

## Minting

`backend/src/modules/auth/anonymous/anonymous-account.ts`:

- `insertAnonymousUser(ctx, { id, name, slug })` inserts the `users` row under a placeholder address, `<id>@anonymous.invalid`, and no `emails` row. RFC 2606 reserves `.invalid` for names that resolve nowhere, and the mailer drops every recipient under it.
- `startAnonymousSession(ctx, user, { expiresAt })` signs the browser in with the strategy `anonymous` until `expiresAt`. An anonymous session always has an expiry: a demo's is its tenant's.

Only a server flow calls these. The flow decides the name, the expiry and what the account is a member of; `createDemo` (`tenants/operations/create-demo.ts`) is the worked example: one transaction builds the account, a tenant of kind `demo`, its organization and the membership, then the app's `onDemoCreated` hooks run.

## What the API serves

The row keeps its placeholder, so the unique `email` column holds. The API never serves it: `User.email` and `UserBase.email` are the proven address or `null`, and `User.isAnonymous` says why. `findUserById` and the session cache keep the row for the server's own flows; the handlers that return a `User` read `findServedUserById`, and member lists `memberSelect`. The client keys on `isAnonymous`, never on the address, and treats a `null` address as absent: no `mailto:`, no prefilled form, no account to invite by.

## What a session reaches

A session's memberships bind it to its tenants, and `tenantGuard` keeps it there: an anonymous account is a member of what its flow made it a member of, and of nothing else.

Every other route that authenticates a session, one with `userGuard` and no tenant guard, refuses an anonymous one with 403 `anonymous_session_restricted` unless the route carries `xAnonymous: true`, documented as `x-anonymous`. `createXRoute` puts the gate right after the guard that authenticates the session, ahead of `stepUpGuard`, `sysAdminGuard` and `relatableGuard`. Whatever comes next, the refusal is the same.

The rule for admitting a route:

- A read about the account itself is admitted, since it answers nothing for an anonymous account (`getMe`, `getMyAuth`, `listMyMemberships`, `listMyInvitations`, `listConnectedApps`, the stream, notifications, unseen counts, `updateMe`, the cross-tenant lists).
- An action that binds, mails, connects or pushes is refused (invitations, `createTenant`, connected apps, sessions, step-up, push, `deleteMe`).

A route an app adds is refused until it says otherwise, and `tests/security/anonymous-gate.test.ts` enumerates the OpenAPI document and names it.

Two rules hold whatever the routes say. An account without a proven address binds no invitation and accepts none (`isProvenAccount`, 403 `anonymous_account`), so lasting access never depends on the route layer. And no mail reaches a placeholder address.

## Lifecycle and limits

The session ends at its expiry. The account goes with the last tenant that held it (`removeDueTenants` removes the anonymous accounts a removed tenant leaves with no membership) or with the orphan sweep. An app's fixture account without an `emails` row follows the same rule.

What limits the minting is the flow's own business: the demo has `appConfig.demo.perDay`, a per-address limiter and the bot check. Anonymous sessions together hold a tenth of the stream cap, so throwaway accounts never crowd out a member's stream.

## Extension point: an identity later

The template ships no conversion. The shape for one is set: proving an address on an anonymous account (an `emails` row through the usual verification, then a fresh session) turns `isAnonymous` false and the account into an ordinary one, with everything it made still its own. A demo deliberately offers none of this, it stays the throwaway its tenant's removal takes along, and an app that wants a "sign up to keep your work" flow builds it on that shape.
