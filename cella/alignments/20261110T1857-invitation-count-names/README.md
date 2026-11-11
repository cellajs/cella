---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: invitationMailsPerDay, invitesSentCount, invitationsSent
generate: true
---

# Invitation emails a day and invitation counts take one name

`defaultRestrictions.rateLimits.invitationMailsPerDay` is `invitationEmailsPerDay`: in the config, in a tenant's
`restrictions` on the wire and in the stored `tenants.restrictions`, which `data.sql` renames below the column default
that `pnpm generate` writes. A system invite's `invitesSentCount` and an organization publish's `invitationsSent` are
`invitationCount`.

## What & why

The rate limit said "mails" where every other name says "email". The two counts of invitations a request sent had two
names, while a count elsewhere is `<noun>Count` (`viewCount`, `unreadCount`, `newCount`). Each value now has one name.

## Blast radius

Every app: `shared/config` and `backend/drizzle` are app-owned, and the typecheck names the config key and each typed
read. A stored tenant needs `data.sql`, else its cap reads as unset. Untyped tests and outside clients that read the old
names escape it. `clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. In the app's `shared/config` files, rename `invitationMailsPerDay` to `invitationEmailsPerDay` under `defaultRestrictions.rateLimits` and under any `tenantKinds.*.restrictions.rateLimits`.
2. Run `pnpm generate` and paste `data.sql` below the generated `SET DEFAULT` of `tenants.restrictions`.
3. Replace `invitesSentCount` and `invitationsSent` with `invitationCount` in app code and tests.

## Verify

```sh
pnpm migrate
pnpm check
```
