---
syncBreaking: true
clientCacheBump: true
---

# Invites answer per address, and the form shows it before sending

`POST /memberships` (`membershipInvite`) returns `{ data, outcomes, held }` in place of `{ data, rejectedIds,
invitesSentCount }`: one `outcomes` entry per address, `invite`, `remind`, `add` or `member`. An app that reads the old
fields from that response moves to `outcomes`. `InviteFormFooter` takes `counts` in place of `count`.

## What & why

Re-inviting an address that already had an invitation showed no message at all. `POST /memberships/check` now tells the
form what an invite would do, so a chip shows "invited 20 Oct" or "member" before sending, and one toast says what
happened after. Re-adding an address always sends its invitation again with a fresh link, a declined one included. A
reminder and a member take no seat. `DELETE /memberships/pending/{id}` withdraws an invitation.

## Blast radius

Apps that call `membershipInvite` themselves or render `InviteFormFooter` in their own forms. Bumps `clientCacheVersion`.
The system invite (`POST /system/invite`) keeps its response.

## Run

No script: manual.

## Manual steps

1. `grep -rn "invitesSentCount\|rejectedIds" frontend/src backend/src backend/tests` in app-owned files that read the membership invite response: count `outcomes` by `outcome` instead.
2. An app-owned form that renders `InviteFormFooter`: call `useInviteCheck(channel, emails)` and pass `counts={check.counts}`.
3. An app test that expects a declined address to be left out, or a reminder to wait 7 days, follows the new rule: both are sent again.

## Verify

```sh
pnpm check
```
