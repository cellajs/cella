---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: seenWindowStart, findUnseenCountsByUser
---

# Unseen counts start at the membership

`getUnseenCountsOp` counts a channel's rows only from the later of the seen window start and the user's membership of
that channel, so a new member's badges start at zero. `findUnseenCountsByUser` takes `channels: { id, cutoff }[]` in
place of `channelIds` and `cutoff`. An app query that lists or counts unseen rows from `seenWindowStart()` alone now
disagrees with the badges for a new member: start it at the membership's `createdAt` as well.

## What & why

On day one a new member saw every row of the last `seenWindowMs` as new. `readMemberships` now selects the membership's
`createdAt` onto `ctx.var.memberships`, and the operation passes each channel's cutoff to `findUnseenCountsByUser`,
which tests channels that share a cutoff together. `GET /me/memberships` still answers the `MembershipBase` fields only
(`toMembershipBase`).

## Blast radius

An app with its own unseen list or count beside the template's badges, or a caller of `findUnseenCountsByUser`, which
typecheck flags. raak's `task/operations/get-unseen-task-ids.ts` already starts at the join time. No wire, database,
cache or lens change.

## Run

No script: manual.

## Manual steps

1. Pass `channels: channelIds.map((id) => ({ id, cutoff }))` to `findUnseenCountsByUser`, or a cutoff per channel.
2. Where an app query compares a row's recency with `seenWindowStart()` for unseen state, compare it with the later of that and the user's membership `createdAt` for the row's home channel.
3. Give each `ctx.var.memberships` entry an app test builds a `createdAt`.

## Verify

For a user who joined a channel today, its badge and any unseen list of it show nothing from before the join.

```sh
pnpm check
```
