---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: relatableGuard, relatableUserId, requireEntityAction, permissions-config, guardNavTabs, listMembers, inviteMembers
---

# Roles decide whom members see

An app adds a `case 'user'` to `shared/config/permissions-config.ts` that grants `read` to every role whose holders see
people; without one, members see nobody but themselves. `relatableGuard` is gone and the list query parameter
`relatableUserId` is `memberUserId`. A tab that lists a channel's people declares `requires: 'people'`, and a
channel route passes `grants` to `guardNavTabs`.

## What & why

Every member of an organization saw every other member, with email: two queries said so and the permission engine had no
say. The engine now takes `user` as a subject that grants only `read`: a person is visible through any membership row the
viewer's roles may read. Lists, profiles, member and invitation lists, invites and `useCan` follow it, and each operation
answers an unseen user itself.

## Blast radius

Every app: no test fails while members see nobody. A permissions callback whose `default` branch throws now throws for
`user` at load. Channel list routes that use `relatableGuard` stop compiling. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In `shared/config/permissions-config.ts`, add the template default with the app's own role names, ahead of any `default` branch:

   ```ts
   case 'user':
     channels.organization.admin({ read: 1 });
     channels.organization.member({ read: 1 });
     break;
   ```

2. Grant `read` to each channel role whose holders open that channel's member list, invite to it or manage its members, unless an elevated organization role of theirs reaches it: a grant reads only the memberships of its own channel.
3. For "only people who share a channel": leave the organization roles out and grant `read` to the roles of the channels whose members may see each other.
4. For "nobody": keep `case 'user'` with no grant.
5. Each channel list route with `[userGuard, relatableGuard]`: drop the guard, rename its `relatableUserId` query parameter to `memberUserId`, and keep another user's list to the organizations `findOrganizationIdsWhereSeen` returns, answering 403 `forbidden` with `entityType: 'user'` when there are none, as `getOrganizationsOp` does.
6. Rename `relatableUserId` to `memberUserId` in frontend list calls, then run `pnpm sdk`.
7. On each tab that lists a channel's members, set `requires: 'people'`, and give the channel's layout route `grants: await loadChannelTabGrants(channel)` in its `guardNavTabs` call. A tab route that called the removed `requireEntityAction` sets its `requires` the same way.
8. If a role sees fewer people than before, change the privacy statement (`frontend/src/modules/marketing/legal/privacy-text.tsx`), which says members see each other's address.

## Verify

```sh
pnpm check
```

Run `tests/security/member-visibility.test.ts` in the backend, then sign in with each role and open the organization's
members tab, a channel's members, the user search, another member's profile and the invite dialog.
