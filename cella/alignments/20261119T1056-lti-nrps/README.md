---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
grep: ltiApiClaim, launchApiClaim, ltiApiClaimSchema, ltiImportScope, launchPlatformApi, PlatformApi, LtiMemberRow, platform-api, api_url, members_url, apiUrl, membersUrl, lti/claim/api, nextPageToken, lti_import.no_api, ltiRegistrationRequest, currentSigningKey, connections_kind_check, oauthUrl}/jwks
---

# LTI course members by NRPS

An app runs `pnpm generate` with this folder's `hints.json`, which adds `lti_contexts.memberships_url` and
`connections.private_jwk`, drops `api_url` and `members_url`, and lets a `pending` LTI connection hold no client id.
The members route `listLtiMembers` answers Names and Role Provisioning Services 2.0 (NRPS) at
`lti-members/{channelType}/{channelId}`, the launch claim under `<issuer>/lti/claim/api` is gone,
`auth/flows/lti/helpers/platform-api.ts` is `platform-memberships.ts`, and each LTI connection signs with a key of its own.

## What & why

Both LTI roles speak NRPS, the standard every learning platform reads courses' members by. As a platform, a launch
carries the NRPS claim, the NRPS scope stands for `user:read` (`ltiServiceScope`), a token request needs no `resource`,
and the route answers a membership container paged by `Link`. As an LTI tool, each connection signs with its own key
pair at its own `jwks_uri`, and no address must lie on the issuer's origin. It stores `membershipsUrl` and skips
members listed `Inactive`.

## Blast radius

Every app: two migrations, and `clientCacheVersion` rises. Two connected apps upgrade together. An LTI connection
registered before holds no key: it launches, and reads members only once registered again. An app reading
`listLtiMembers` or the old claim breaks. The `lti` sign-in method no longer needs `services.oauth`.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"`: it adds one column and drops two, with no hand-written SQL. A course's next Instructor launch stores its membership address.
2. Import `PlatformFetchOptions`, `isUnder` and `parseJson` from `auth/flows/lti/helpers/platform-memberships.ts`.
3. Where app code reads `listLtiMembers`, pass `channelType` and `channelId` in the path and read `members`, `user_id` and the `Link` header in place of `results`, `id` and `nextPageToken`.
4. Where an app sets its own `clientCacheVersion`, raise it.
5. As an LTI tool, ask each connected platform's admin to register the app again with a new registration link, then delete the old connection: until then its courses say it must register again.
6. Where app code calls `ltiRegistrationRequest()`, pass the connection's id; where it signs for a platform with `currentSigningKey`, sign with `connectionSigningKey` of the connection.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"
pnpm check
```
