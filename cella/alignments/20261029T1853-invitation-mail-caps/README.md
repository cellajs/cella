---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: invitationMailsPerDay, declinedInvitationHoldDays, invitation_limit_reached, sendSecurityInboxEmail, withdrawPendingInvitation
generate: true
---

# Invitation mails capped per tenant and per address

An app adds `invitationMailsPerDay` to `defaultRestrictions.rateLimits` and `declinedInvitationHoldDays` to `retention`
in its `shared/config/*.ts`, and runs `pnpm generate` for the new `tenants.restrictions` default. Invitations, reminders
and resends now mail an address at most once a day per tenant and stop at the tenant's daily total with 429
`invitation_limit_reached`; a decline holds for the hold days, and a declined row is no longer withdrawn.

## What & why

Any signed-in user could mail strangers from the app's sender, and remind one address on every call. The caps live in
`backend/src/modules/memberships/operations/take-invitation-mails.ts`, the hold in `shared/src/decline-hold.ts`.
`sendSecurityInboxEmail` takes `raisedBy`, which throttles an alert per user and per type, and the request form mails
an address once a day whatever the type.

## Blast radius

Every app's config: the typecheck names both keys. One migration sets a column default; stored rows gain the field
when read. No lens or cache change. App tests that mail one address twice within a test, or reopen a fresh decline,
now see no second mail.

## Run

No script: manual.

## Manual steps

1. In each `shared/config/*.ts` the typecheck names, add `invitationMailsPerDay: 250` to `defaultRestrictions.rateLimits` and `declinedInvitationHoldDays: 30` to `retention`.
2. Run `pnpm generate`: it alone writes the migration, one `ALTER COLUMN "restrictions" SET DEFAULT` on `tenants`.
3. An app guard or route that any signed-in user reaches and that mails the security inbox passes that user as the third argument of `sendSecurityInboxEmail`.
4. An app test that mails one address twice calls `endRateLimitWindows('invitationMailAddress')` between the mails, and one that reopens a decline sets `rejectedAt` past `declinedInvitationHoldDays`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test
```

Then invite one address twice in a row: the second invite answers `remind` and sends no mail.
