---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: memberships/{id}/{acceptOrReject}, /memberships/${, /accept`, /reject`
---

# Answering an invitation moves to /me/invitations/{id}/{acceptOrReject}

The route that accepts or rejects an invitation, `handleMembershipInvitation`, moves from
`/{tenantId}/{organizationId}/memberships/{id}/{acceptOrReject}` to `/me/invitations/{id}/{acceptOrReject}`. Calls
through the SDK follow after `pnpm sdk`; a request or test that writes the old URL by hand changes its path.

## What & why

The route sat under the tenant and organization mount but declared neither as a parameter, so the SDK sent the
literal `{tenantId}/{organizationId}` placeholders. An invitee is no member yet, so no tenant or organization guard runs
and nothing reads those segments. It now sits beside `GET /me/invitations`, which lists the invitations it answers.
`clientCacheVersion` moves to `v33-invitation-answer-route`: the schema-bust gate counts a removed path as a breaking
OpenAPI change.

## Blast radius

An app that calls the old URL outside the SDK, in its own code or tests. The response, the operation id and the SDK
function stay the same. No database change. Clients drop their cached queries once on the new build; queued writes
stay. A tab still on an old build fails this one call until it reloads.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`.
2. If `shared/config` sets its own `clientCacheVersion`, change its value.
3. Replace a hand-written `/{tenantId}/{organizationId}/memberships/{id}/{acceptOrReject}` path with
   `/me/invitations/{id}/{acceptOrReject}`.

## Verify

```sh
pnpm check
```
