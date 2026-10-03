---
syncBreaking: true
clientCacheBump: true
---

# Invitations and requests no longer point at a token

`inactive_memberships.tokenId` is gone: an invitation goes by link while no account holds it (`userId` is null), and
its tokens are found through `tokens.inactiveMembershipId`. `updateInactiveMembershipToken` is removed. On `requests`,
`tokenId` becomes the timestamp `invitedAt`; `linkWaitlistRequest(ctx, { email, tokenId })` is
`stampWaitlistRequestInvited(ctx, { email })`. The `Request` response keeps `wasInvited`; the `InactiveMembership`
response loses `tokenId`, so `clientCacheVersion` bumps.

## What & why

Both columns held the id of a token that is deleted when spent or swept, so they pointed at nothing and served as
markers only. The marker on invitations went stale: an invitee who signed up while the invitation was held kept it, and
the deferred dispatch then minted a link for an account that answers in-app. `userId` says the same thing and stays
true. A request needs only the fact and its time.

## Blast radius

Sync-breaking for app code that reads or writes either `tokenId`, calls `linkWaitlistRequest` or
`updateInactiveMembershipToken`, or inserts invitation rows in tests with a `tokenId`. One schema migration with a
backfill. `clientCacheVersion` bumps for the removed response property.

## Run

No script: manual.

## Manual steps

1. `backend/drizzle` is app-owned: run `cd backend && pnpm tsx scripts/generate.ts --hints '[{"type":"create","kind":"column","entity":["public","requests","invited_at"]}]'` (the hint answers drizzle's rename-or-create question), then add the `UPDATE "requests" SET "invited_at" = ...` line from the template's `20261003090020_drop_token_back_pointers` between the added column and the dropped one.
2. Replace `row.tokenId` checks on an invitation with `!row.userId`, and look tokens up with `eq(tokensTable.inactiveMembershipId, invitation.id)`.
3. Replace `linkWaitlistRequest` calls with `stampWaitlistRequestInvited(ctx, { email })`.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm sdk
pnpm check
pnpm --filter backend test
```
