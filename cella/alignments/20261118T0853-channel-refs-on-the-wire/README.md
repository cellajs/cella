---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: entityWithTypeSchema, entityId, entityName, channelThumbnailUrl, organizationThumbnailUrl, organizationName, findChannelLabels, toUserMinimalBase, resolveContextId
generate: true
---

# A channel is channelId and channelType on the wire

The membership routes (`inviteMembers`, `checkMemberInvite`, `batchDeleteMembers`, `listMembers`, `listInvitations`,
`leaveMembership`) take `channelId`/`channelType` where they took `entityId`/`entityType`; `entityWithTypeSchema` is
`channelRefSchema`. Token data's invitation says `channelType`/`channelName`. A notification carries `channel` and
`organization` minimal references, its `contextId` is never null, and `notifications.context_id` goes not null.

## What & why

One channel had four spellings, so code renamed it at every hop. Notifications: `channelName`, `channelThumbnailUrl`,
`organizationName`, `organizationThumbnailUrl` become `channel` and `organization` (null when unreadable or gone);
`findChannelLabels` is `findChannelsMinimal`; `toUserMinimalBase(row)` is `toMinimalBase('user', row)`;
`resolveContextId` returns a string; `homeChannelOf` returns `{ channelId, channelType }`; the i18n slot
`{{entityName}}` is `{{channelName}}` in three `invite_*` keys.

## Blast radius

Every app: the wire and the SDK change, `clientCacheVersion` rises and one column goes not null. The compiler misses
raw query strings, `app.json` overrides of the three invitation keys, and a module's `resolveContextId` that returns
null.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it produces one `ALTER COLUMN "context_id" SET NOT NULL` on `notifications`. Paste `data.sql` above it in the new `migration.sql`; no rename hints.
2. Rename `entityId`/`entityType` to `channelId`/`channelType` in app calls of the membership routes, raw URLs and `URLSearchParams` included.
3. Make each module's `resolveContextId` return a string (the row's own id where it returned null).
4. Rename `{{entityName}}` to `{{channelName}}` in `app.json` overrides of `invite_accept_as_account`, `invite_accept_as_account_in_organization` and `invite_join_in_organization`.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
