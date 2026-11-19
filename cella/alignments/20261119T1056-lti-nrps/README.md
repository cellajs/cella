---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
grep: ltiApiClaim, launchApiClaim, ltiApiClaimSchema, ltiImportScope, launchPlatformApi, PlatformApi, LtiMemberRow, platform-api, api_url, members_url, apiUrl, membersUrl, lti/claim/api, nextPageToken, lti_import.no_api, ltiRegistrationRequest, currentSigningKey, connections_kind_check, oauthUrl}/jwks, findLtiMembersPage, mockLtiMemberResponse, ltiMemberSchema, findLtiPlacements, getLtiMembersOp, planLtiContextChannel, readLtiMembers, LtiRoleFacts, ltiContextRole, findLtiContext, findIdentityBySubject, lockIdentityKey, isUnder, PlatformFetchOptions, parseJson, lti_contexts_connection_id_context_id_idx, identities_kind_provider_subject_idx
---

# LTI course members by NRPS

An app runs `pnpm generate` with this folder's `hints.json` and `data.sql`: it adds `lti_contexts.issuer` and
`memberships_url`, `connections.private_jwk` and `identities.tenant_id`, drops `api_url` and `members_url`, and keys
LTI identities and contexts per tenant. The members route `listLtiMembers` answers Names and Role Provisioning Services
2.0 (NRPS) at `lti-members/{channelType}/{channelId}`, the claim under `<issuer>/lti/claim/api` is gone,
`auth/flows/lti/helpers/platform-api.ts` is `platform-memberships.ts`, each LTI connection signs with a key of its own,
and the app's `ltiContextRole` learns which channel type it answers for.

## What & why

Both LTI roles speak NRPS 2.0 for a course's members. As a platform, a launch carries the NRPS claim, the NRPS scope
stands for `user:read`, and the route answers a membership container paged by `Link`. As an LTI tool, each connection
signs with its own key at its own `jwks_uri`, and imports run per connection within a budget. LTI identities and
contexts are keyed per tenant: a platform registered in one tenant reaches no account made through another, and a new
registration finds its courses' channels again.

## Blast radius

Every app: one migration with hand-written statements, and `clientCacheVersion` rises. Two connected apps upgrade
together. An LTI connection registered before holds no key: it launches, and reads members once registered again. An
app's `ltiContextRole` and LTI tests it edited need a look. The `lti` sign-in method no longer needs `services.oauth`.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"` and put each statement of `data.sql` where its comment says: the migration adds `lti_contexts.issuer` and `memberships_url`, `connections.private_jwk` and `identities.tenant_id`, drops `lti_contexts.api_url` and `members_url`, keeps a context whose connection is deleted, and replaces `connections_kind_check` so a `pending` LTI connection holds no client id.
2. After the deploy, a course's next launch that names a membership address stores it, and a teacher's launch that names none clears it.
3. Import `PlatformFetchOptions` and `parseJson` from `auth/flows/lti/helpers/platform-fetch.ts`; `isUnder` is private to `register-lti-platform.ts`.
4. Where app code reads `listLtiMembers`, pass `channelType` and `channelId` in the path and read `members`, `user_id` and the `Link` header in place of `results`, `id` and `nextPageToken`.
5. In the app's `lti-context-channel.ts`, `ltiContextRole` reads `channelType` from `LtiRoleFacts` and answers a role of that channel type; any other answer becomes its least privileged role.
6. Make `ltiContextRole` answer every role a platform lists: `ltiRoles` are full URIs, short context role names arrive mapped, and institution and system roles arrive as sent, as Moodle sends them.
7. Where app code finds, locks or inserts an identity of kind `lti`, pass its `tenantId` (`findIdentityBySubject`, `lockIdentityKey`, `insertIdentity`); find a context by tenant, issuer and context id (`findLtiContext`).
8. Where an app edited the template's LTI tests to mock its own `lti-context-channel.ts` or `launch-context.ts`, drop those mocks: the tests mock both with the template's answers from `backend/tests/lti-template-answers.ts`.
9. Where an app sets its own `clientCacheVersion`, raise it; where it sets its own `retention`, add `pendingLtiConnectionDays`.
10. As an LTI tool, ask each connected platform's admin to register the app again with a new registration link, then delete the old connection: its courses keep their channels and members, and say they must register again until then.
11. Registering again is the whole upgrade path for a connection made before this, since no app runs it in production; re-seed a database that holds such connections.
12. Where app code calls `ltiRegistrationRequest()`, pass the connection's id; where it signs for a platform with `currentSigningKey`, sign with `connectionSigningKey` of the connection.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"
pnpm check
```
