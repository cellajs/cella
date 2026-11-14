---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: inactiveMembership, inactiveMembershipsTable, inactive_membership, inactiveMembershipId, pendingMemberships, pendingMembershipSchema, remindedAt, invitedAt, emailedAt, declineHolds, dispatchDeferredInvites, resendInvitation, deleteMyMembershipOp, getPendingMembershipsOp, inactive_memberships, reminded_at
generate: true
---

# Invitations have a status and one name

`inactive_memberships` is `invitations` (`invitationsTable` in `invitations-db.ts`), with `status` (`held`, `pending`,
`declined`), `statusChangedAt`, the audit columns and `mailedAt` for `remindedAt`; `requests.invitedAt` and
`notifications.emailedAt` are `mailedAt` too. The resource type `inactive_membership` is `invitation`,
`tokens.inactiveMembershipId` is `invitationId` and `appConfig.pageSizes.pendingMemberships` is `invitations`. The wire says `invitation`, outcome `resend` and `declined`, and every
invitation mail goes through `mailWithinCaps`. Run `pnpm generate` with this folder's `hints.json` and append `data.sql`.

## What & why

Held was a null `remindedAt`, so a pending invitation whose first mail was held back or failed was never swept. The
status says it now: a publish releases held rows (`mailHeldInvitations`), and the sweep ages a pending row from its last
mail or its creation. A declined row goes when `retention.declinedInvitationHoldDays` ends, so it is never reopened.

## Blast radius

Every app: a schema rename with a data move, renamed exports and wire fields, and `clientCacheVersion` moves. An app
that inserts invitations, reads `declinedAt` for pending, or mails one outside `mailWithinCaps` follows. Stored
activities move to the new resource type.

## Run

No script: manual.

## Manual steps

1. Rename `inactiveMembershipsTable` to `invitationsTable`, `InactiveMembershipModel` to `InvitationModel`, and imports of `inactive-memberships-db` and `-queries` to `invitations-db` and `invitations-queries`.
2. Replace `isNull(declinedAt)` with `eq(status, 'pending')` where only an answerable invitation counts, and `ne(status, 'declined')` where a held one counts too.
3. Set `status: 'held'` on an invitation an app inserts for a channel that waits for its publish, and `'pending'` otherwise.
4. Replace `remindedAt` with `mailedAt`, `requests.invitedAt` with `mailedAt`, `notifications.emailedAt` with `mailedAt`, and `stampWaitlistRequestInvited` with `stampWaitlistRequestMailed`.
5. Mail an invitation through `mailWithinCaps` (or `mailHeldInvitations` after a publish), never `mailInvitations`, `resendInvitation` or `dispatchDeferredInvites`.
6. Rename `inactive_membership` to `invitation` in `resourceTypes`, in `onMutation` event names and in resource-type switches, `inactiveMembershipId` to `invitationId` (tokens, `TokenData`), and `pageSizes.pendingMemberships` to `invitations`: the index signature hides a missed key.
7. Read `Invitation.invitation` for `inactiveMembership`, outcome `resend` for `remind` and `declined` for a remind with `declinedAt`; `declineHolds` is `declineHoldEnd`.
8. Rename i18n overrides `success.delete_members`, `invite_and_remind` and `invite_result_reminded` to `success.remove_members`, `invite_and_resend` and `invite_result_resent`; `remind` is `resend`.
9. Add a `held` statement to `data.sql` for each app channel table with drafts, as the organizations one does.
10. Run `pnpm generate` with `hints.json` and append `data.sql` to the generated migration. It renames the foreign keys of an app's channel columns too; a key whose name drizzle hashes stops the migration and takes a `RENAME CONSTRAINT` of its own beside the organization key's.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
