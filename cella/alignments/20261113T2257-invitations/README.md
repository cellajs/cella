---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: inactiveMembership, inactiveMembershipsTable, pendingMembershipSchema, remindedAt, invitedAt, emailedAt, declineHolds, dispatchDeferredInvites, resendInvitation, deleteMyMembershipOp, getPendingMembershipsOp, inactive_memberships, reminded_at
generate: true
---

# Invitations have a status and one name

`inactive_memberships` is `invitations` (`invitationsTable` in `invitations-db.ts`), with `status` (`held`, `pending`,
`declined`), `statusChangedAt`, the audit columns and `mailedAt` for `remindedAt`; `requests.invitedAt` and
`notifications.emailedAt` are `mailedAt` too. The wire says `invitation`, outcome `resend` and `declined`, and every
invitation mail goes through `mailWithinCaps`. Run `pnpm generate` with this folder's `hints.json` and append `data.sql`.

## What & why

Held was a null `remindedAt`, so a pending invitation whose first mail was held back or failed was never swept. The
status says it now: a publish releases held rows (`mailHeldInvitations`), and the sweep ages a pending row from its last
mail or its creation. A declined row goes when `retention.declinedInvitationHoldDays` ends, so it is never reopened. A
role raise is a new invitation by the raising inviter.

## Blast radius

Every app: a schema rename with a data move, renamed exports and wire fields, and `clientCacheVersion` moves. An app
that inserts invitations, reads `declinedAt` for pending, or mails one outside `mailWithinCaps` follows. The resource
type `inactive_membership` and `tokens.inactiveMembershipId` stay.

## Run

No script: manual.

## Manual steps

1. Rename `inactiveMembershipsTable` to `invitationsTable`, `InactiveMembershipModel` to `InvitationModel`, and imports of `inactive-memberships-db` and `-queries` to `invitations-db` and `invitations-queries`.
2. Replace `isNull(declinedAt)` with `eq(status, 'pending')` where only an answerable invitation counts, and `ne(status, 'declined')` where a held one counts too.
3. Set `status: 'held'` on an invitation an app inserts for a channel that waits for its publish, and `'pending'` otherwise.
4. Replace `remindedAt` with `mailedAt`, `requests.invitedAt` with `mailedAt`, `notifications.emailedAt` with `mailedAt`, and `stampWaitlistRequestInvited` with `stampWaitlistRequestMailed`.
5. Mail an invitation through `mailWithinCaps` (or `mailHeldInvitations` after a publish), never `mailInvitations`, `resendInvitation` or `dispatchDeferredInvites`.
6. Read `Invitation.invitation` for `inactiveMembership`, outcome `resend` for `remind` and `declined` for a remind with `declinedAt`; `declineHolds` is `declineHoldEnd`.
7. Rename i18n overrides `success.delete_members`, `invite_and_remind` and `invite_result_reminded` to `success.remove_members`, `invite_and_resend` and `invite_result_resent`; `remind` is `resend`.
8. Add a `held` statement to `data.sql` for each app channel table with drafts, as the organizations one does.
9. Run `pnpm generate` with `hints.json`, append `data.sql` to the generated migration, and rename the snapshot's old `inactive_memberships_*` constraint names to the ones `data.sql` gives.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
