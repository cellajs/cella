---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: resendInvitationEmail, remindInvitee, unboundOpener, replaces, TokenReplacement, hasLiveInvitationToken, updateMembershipCounts, inactive_membership_id
generate: true
---

# One way to mail an invitation, its links go with its row

An app runs `pnpm generate` for the foreign key `tokens.inactive_membership_id` → `inactive_memberships.id` (cascade) and its index, with `data.sql` placed first. App code calling `resendInvitationEmail`, `hasLiveInvitationToken` or reading a token policy's `replaces` or `unboundOpener` moves to `resendInvitation`, `resendInvitationByTokenOp`, `hasLiveSystemInvitationToken` and `replacementSubjects`. Two behaviours change: the public resend of an expired address-confirmation link mails a plain invitation link bound to no account (it grants nothing more), and a published channel's dispatch mails a non-held invitation whose first mail failed, charging no cap.

## What & why

Four paths mailed an invitation again, each with its own lock, caps, sender and language. Every invitation mail now goes through `mailInvitations` (row locked, link issued, grouped mail, `remindedAt` stamped only after a sent mail); a held invitation gets its first link at dispatch. A token outliving its invitation let that address sign up while registration was closed. `getTokenData` no longer binds a late account: `createAccount`, `addProvenEmail` and `markEmailVerified` claim the address's invitations in their transaction.

## Blast radius

Every app: `backend/drizzle` is app-owned, so the migration is generated there. An app test that inserts an invitation token for an id without its row, or expects a token on a held invitation, fails. No wire, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it produces `CREATE INDEX "tokens_inactive_membership_id_idx"` and the `ADD CONSTRAINT ... ON DELETE CASCADE` on `tokens`. Paste `data.sql` above them in the new `migration.sql`; no rename hints.
2. Replace a call of `resendInvitationEmail(ctx, token)` with `resendInvitation(ctx, { invitation, organization })` from `resend-pending-invitation.ts`, which takes the mail caps, for a membership invitation, or `resendInvitationByTokenOp(ctx, tokenId)` for the public resend. `mailInvitations` is the one send path behind both and takes no cap itself.
3. A token type an app added declares its subject in `replacementSubjects` (`tokens-queries.ts`) and drops `replaces` and `unboundOpener` from its policy.
4. In app tests, insert the `inactive_memberships` row before a token that names it, and expect no token on a held invitation until its channel's dispatch.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
