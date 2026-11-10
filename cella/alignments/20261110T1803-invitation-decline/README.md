---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: rejectedAt, rejected_at, rejectInvitation, ~reject, reject_invitation
generate: true
---

# An invitation is declined, not rejected

`inactive_memberships.rejectedAt` is `declinedAt`, and `pnpm generate` with this folder's `hints.json` renames its column.
The route `POST /me/invitations/{invitationId}:reject` is `:decline` with operation `declineInvitation`, the invitation
answer's action `'reject'` is `'decline'`, and the label `c:success.reject_invitation` is `c:success.decline_invitation`.

## What & why

The interface, the config (`declinedInvitationHoldDays`) and the invite outcome (`declinedAt`) said "decline", while the
column, the route and the operation said "reject". One verb now names the invitee's answer everywhere.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. Raw SQL and untyped test rows that
name `rejected_at` or `rejectedAt` escape it. An outside client that posts `:reject` breaks. `clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1803-invitation-decline/hints.json)"`.
2. Replace `rejectedAt` with `declinedAt` and `rejected_at` with `declined_at` in app code, raw SQL and tests.
3. Call `declineInvitation` where the app called `rejectInvitation`, and pass `'decline'` where it passed `'reject'`.
4. An app that overrides `success.reject_invitation` in `app.json` renames the key with `pnpm cella i18n rename`.

## Verify

```sh
pnpm migrate
pnpm check
```
