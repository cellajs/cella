---
breaking: false
clientCacheBump: false
grep: MenuStructureItem, menuStructure, channelIdColumnsOf
---

# Channel roles narrow per channel

The permissions config offers each channel only the roles `shared/config/hierarchy-config.ts` declares for it, and
the membership helpers return typed roles and nullable ancestor columns. No app edit is required to compile unless the
app's permissions config calls a role its channel never declared: that call threw "is not a function" when the config
loaded, and is now a compile error.

## What & why

`ChannelPolicyBuilder` keys each channel by `ChannelRoleOf<C>`, so a role the hierarchy does not declare for that
channel fails to compile. `resolveHierarchy` narrows an injected hierarchy once. Three membership helpers change:
`resolveAssociatedMembershipRole` and the brought-along roles return `EntityRole`; `channelIdColumnsOf(entity)` drops
its type parameter and returns `{ organizationId: string } & Partial<ChannelIdColumns>`, null for an empty ancestor;
`findMenuParent` reads `menuSections`, the menu structure typed once.

## Blast radius

Not breaking for an app whose permissions config calls only declared roles, as raak's and projectcampus's do. No
database, lens or `clientCacheVersion` change. App code reading a column below the organization from
`channelIdColumnsOf` now sees `string | null | undefined`.

## Run

No script: manual.

## Manual steps

1. Where typecheck reports `Property '<role>' does not exist` on `channels.<type>.<role>` in `shared/config/permissions-config.ts`, the hierarchy does not declare that role for that channel: delete the call, or add the role to the channel's `roles` in `shared/config/hierarchy-config.ts`.
2. Read the menu structure through `menuSections` from `shared` in place of a cast or a hand-written entry shape over `appConfig.menuStructure` (a `MenuStructureItem` cast to read `carryRole` or `archivable`).

## Verify

```sh
pnpm check
```
