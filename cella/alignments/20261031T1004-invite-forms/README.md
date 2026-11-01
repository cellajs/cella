---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: PendingMembershipsTable, pending-table, inviteBatches, role_description, invite_count, remind_count, invite_bulk, email_bulk, c:reject, SelectEmails, invite-email-form, invite-bulk-email-form, invite-search-form, invited_on, declined_on
---

# Invite forms share one state language

An app with roles of its own adds a `role_description.<role>` locale key for each. An app that imports `PendingMembershipsTable`, `SelectEmails` or an invite form file moves to their new places, and one that overrides a removed invite locale key drops that override.

## What & why

Invite modes became a segmented control over one form, addresses read as session tiles do, and a paste names what it could not read. `InviteUsers` owns the form, so `invite-*-form.tsx` became `invite-*-field.tsx`. `select-emails.tsx` moved from `common/form-fields` to `user`. `useInviteCheck` answers through `viewOf` and `groups`. `pending-table/` became `pending-memberships-list.tsx`.

## Blast radius

Apps that kept the template roles and never imported these files get the change for free. Typecheck flags every other site. The pending response gains `linkExpiresAt`. No lens and no database change.

## Run

No script: manual.

## Manual steps

1. Add `role_description.<role>` for each role an app adds, in `locales/en/app.json`.
2. Replace `PendingMembershipsTable` with `PendingMembershipsList`, which takes the same `channel` prop.
3. Import `SelectEmails` from `~/modules/user/select-emails`, passing `unparsed`, `onUnparsedChange` and `viewOf`, or render `InviteUsers` in its place.
4. Remove overrides of the removed keys, such as `invite_count`, `remind_count`, `invite_bulk.text`, `email_bulk`, `invited_on`, `declined_on` and `reject`.

## Verify

```sh
pnpm sdk
pnpm check
```
