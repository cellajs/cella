---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
grep: ltiApiClaim, launchApiClaim, ltiApiClaimSchema, ltiImportScope, launchPlatformApi, PlatformApi, LtiMemberRow, platform-api, api_url, members_url, apiUrl, membersUrl, lti/claim/api, nextPageToken, lti_import.no_api
---

# LTI course members by NRPS

An app runs `pnpm generate` with this folder's `hints.json`, which adds `lti_contexts.memberships_url` and drops
`api_url` and `members_url`. The members route `listLtiMembers` answers Names and Role Provisioning Services 2.0 (NRPS) at
`lti-members/{channelType}/{channelId}`, the launch claim under `<issuer>/lti/claim/api` is gone, and
`auth/flows/lti/helpers/platform-api.ts` is `platform-memberships.ts`.

## What & why

Both LTI roles speak NRPS, the standard every learning platform and LTI tool library reads courses' members by. As a
platform, a launch carries the NRPS claim, the platform offers and records the NRPS scope for `user:read`
(`ltiServiceScope`), a token request needs no `resource`, and the route answers a membership container paged by `Link`.
As an LTI tool, the app stores `membershipsUrl`, asks the NRPS scope and skips members listed `Inactive`.

## Blast radius

Every app: one migration, and `clientCacheVersion` rises. Two apps on the template connected by LTI upgrade together:
either side on the old wire reads no members until both run this, and then a registration and grant made before keep
working. An app reading `listLtiMembers` or the old claim breaks.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"`: it adds one column and drops two, with no hand-written SQL. A course's next Instructor launch stores its membership address.
2. Import `PlatformFetchOptions`, `isUnder` and `parseJson` from `auth/flows/lti/helpers/platform-memberships.ts`.
3. Where app code reads `listLtiMembers`, pass `channelType` and `channelId` in the path and read `members`, `user_id` and the `Link` header in place of `results`, `id` and `nextPageToken`.
4. Where an app sets its own `clientCacheVersion`, raise it.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"
pnpm check
```
