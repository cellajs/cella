---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: dispatchDeferredInvites
---

# dispatchDeferredInvites takes the organization as an argument

`dispatchDeferredInvites(ctx, { channelIds, organization })` takes a `DbContext` and the channels' organization, where
it took an `OrgContext` and read `ctx.var.organization`. An app's own publish flow that calls it passes the organization
it already holds: projectcampus `course/operations/publish-course.ts` adds `organization` beside `channelIds`. The
template's organization publish and its test arrive with the upgrade.

## What & why

The organization publish route mounts `userGuard` and `tenantGuard`, no `orgGuard`, so `ctx.var.organization` was unset
there and invitations a draft organization held were mailed in the app's default language. `UserContext` claims the
organization on every route, which let the call compile. The function now reads only the database connection, and the
caller hands it the organization.

## Blast radius

Breaking for an app module that calls `dispatchDeferredInvites`: typecheck flags the missing argument. No wire, database
or cache change. An app without a publish flow of its own is unaffected.

## Run

No script: manual.

## Manual steps

1. In each own call of `dispatchDeferredInvites`, pass `organization`: the row the operation resolved, or `ctx.var.organization` on a route behind `orgGuard`.

## Verify

```sh
pnpm check
```
