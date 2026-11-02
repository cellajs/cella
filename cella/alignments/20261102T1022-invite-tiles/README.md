---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: SelectEmails, select-emails, InviteChip, InviteSummary, UserCombobox, InputTriggerChevron, chipNote, openInviteDialog, add_email, invite_mode, invite_group_again, invite_group_fix
---

# Invite forms collect addresses in tiles

An app that imports `SelectEmails`, `InviteChip`, `InviteSummary`, `UserCombobox` or `InputTriggerChevron`, passes `mode` to `openInviteDialog` or reads `chipNote` moves off them, and one that overrides a removed invite locale key drops that override.

## What & why

The invite dialog opens on its chooser and names the mode in its title. Addresses collect below the field in one tile per outcome, as plain chips. `select-emails.tsx` is gone: its parser moved to `invite-text.ts`, and `useInviteList` holds what the fields add to. `UserCombobox` picks one person at a time, and `InviteView.chipNote` became `fact`.

## Blast radius

Apps that never imported these files get the change for free, unless they override a removed locale key. Typecheck flags every other site. No lens, no database change and no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Render `InviteUsers` in place of `SelectEmails` or `UserCombobox`.
2. Import `parseInviteText` and `withPasted` from `~/modules/user/invite-text`.
3. Drop `mode` from `openInviteDialog` calls.
4. Replace `InputTriggerChevron` with `InputTriggerButton`, or with a `ChevronDownIcon` of your own.
5. Rename `chipNote` to `fact` where an app reads an `InviteView`.
6. Remove overrides of `add_email`, `invite_mode`, `invite_group_again` and `invite_group_fix`.

## Verify

```sh
pnpm check
```
