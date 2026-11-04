---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: toMembershipBase, getMyMemberships
---

# Cached memberships are base rows, and toMembershipBase takes one

`GET /me/memberships` answers `MembershipBase` items only: each item loses `createdAt`, `updatedAt` and a raw
`updatedBy` id that its schema never declared. `toMembershipBase` is typed
`(membership: MembershipBaseModel) => MembershipBaseModel`. Every app call compiles unchanged. raak: `create-projects.ts`
and `create-workspaces.ts` pass rows `insertMemberships` returns, `move-project-to-workspace.ts` and
`assign-project-workspace.ts` the row `insertMembershipRows` returns through `membershipBaseSelect`, `get-projects.ts`
and `get-workspaces.ts` a listed membership selected through `membershipBaseSelect` or a cached one, and the project and
workspace `to-*-response.ts` a binding `isMembershipRow` narrowed. projectcampus: `create-courses.ts`,
`create-course-sections.ts` and `create-projects.ts` pass rows `insertMemberships` returns, `get-courses.ts`,
`get-course-sections.ts` and `get-projects.ts` a left-joined `membershipBaseSelect` object after `membership?.id`
(drizzle makes the joined object nullable as a whole, so the check narrows it to a base row), `self-join-channel.ts` a
cached membership, and the course, course section and project `to-*-response.ts` a binding `isMembershipRow` narrowed.

## What & why

`readMemberships` in `middlewares/guard/membership-cache.ts` read every membership column into a list typed
`MembershipBaseModel & { createdBy }`, so the me handler's `createdBy` strip let three undeclared fields through. It now
selects `membershipBaseSelect` plus `createdBy`. `toMembershipBase` picks the `membershipBaseSchema` keys with `pick`
from `utils/pick.ts`, so its input is checked and its casts go.

## Blast radius

Breaking only for code that read `createdAt`, `updatedAt` or `updatedBy` off `/me/memberships`, `ctx.var.memberships`
or `actor.bindings` past the types; the three repos have none. Bumps `clientCacheVersion`: a cached memberships list
holds the three fields. No database or lens change.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.
2. A `toMembershipBase` call that typecheck flags passes a row it built by hand: select it through `membershipBaseSelect`, or pass the row `insertMemberships` returns.

## Verify

```sh
pnpm check
```
