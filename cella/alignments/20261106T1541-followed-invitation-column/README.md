---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
---

# A sign-in link records the invitation its browser followed: one tokens column

`tokens` gains `followed_invitation_id`, a nullable uuid that references `inactive_memberships` with `ON DELETE SET NULL`, and its partial index `tokens_followed_invitation_id_idx`. Run `pnpm generate` once after the upgrade; nothing in app code changes.

## What & why

A magic link asked for in a browser that opened an invitation link now records that invitation on the link's token (`followedInvitationId` in `tokens-db.ts`). Clicking the link on another device then accepts the invitation, as clicking it in the same browser already did. The column is apart from `inactiveMembershipId`, whose cascade would delete the sign-in link with a withdrawn invitation.

## Blast radius

Every app with magic links: without the column, issuing any token fails, so an inherited test that sends a magic link fails too. Touches the database (one column, one index, one foreign key); no wire change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it writes the `ALTER TABLE "tokens" ADD COLUMN "followed_invitation_id" uuid`, the index and the foreign key; no hints, no hand-written SQL.

## Verify

```sh
pnpm generate
pnpm check
```
