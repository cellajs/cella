---
breaking: true
clientCacheBump: true
caughtBy: compiler
generate: true
grep: requestLtiMemberImport, upsertLtiContext, defaultRestrictions, RateLimitIdentifier, ltiApiClaim, launchApiClaim, ltiApiClaimSchema, ltiImportScope, launchPlatformApi, PlatformApi, LtiMemberRow, platform-api, api_url, members_url, apiUrl, membersUrl, lti/claim/api, nextPageToken, lti_import.no_api, ltiRegistrationRequest, currentSigningKey, connections_kind_check, oauthUrl}/jwks, findLtiMembersPage, mockLtiMemberResponse, ltiMemberSchema, findLtiPlacements, getLtiMembersOp, planLtiContextChannel, readLtiMembers, LtiRoleFacts, ltiContextRole, findLtiContext, findIdentityBySubject, lockIdentityKey, isUnder, PlatformFetchOptions, parseJson, lti_contexts_connection_id_context_id_idx, identities_kind_provider_subject_idx
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
2. Keep the step of `data.sql` that deletes duplicate course rows before the unique index: of two connections of one tenant and issuer that both launched a course, the oldest row and its channel stay, and the other channel stays without its row.
3. After the deploy, a course's next launch that names a membership address stores it; a launch that names none keeps it, and a refusal of the scope or the member list clears it.
4. An LTI identity whose connection was deleted before the upgrade gets no tenant: its person gets a new account at their next launch.
5. Import `PlatformFetchOptions` and `parseJson` from `auth/flows/lti/helpers/platform-fetch.ts`; `isUnder` is private to `register-lti-platform.ts`.
6. Where app code reads `listLtiMembers`, pass `channelType` and `channelId` in the path and read `members`, `user_id` and the `Link` header in place of `results`, `id` and `nextPageToken`.
7. In the app's `lti-context-channel.ts`, `ltiContextRole` reads `channelType` from `LtiRoleFacts` and answers a role of that channel type; any other answer becomes its least privileged role.
8. Make `ltiContextRole` answer every role a platform lists: `ltiRoles` are full URIs, short context role names arrive mapped, and institution and system roles arrive as sent, as Moodle sends them.
9. Where app code finds, locks or inserts an identity of kind `lti`, pass its `tenantId` (`findIdentityBySubject`, `lockIdentityKey`, `insertIdentity`); find a context by tenant, issuer and context id (`findLtiContext`).
10. Where an app edited the template's LTI tests to mock its own `lti-context-channel.ts` or `launch-context.ts`, drop those mocks: the tests mock both with the template's answers from `backend/tests/lti-template-answers.ts`.
11. Where an app sets its own `clientCacheVersion`, raise it; where it sets its own `retention`, add `pendingLtiConnectionDays`; add `ltiConnection: 3` to its `defaultRestrictions.quotas`: without it a tenant's LTI connections have no cap.
12. Where app code calls `requestLtiMemberImport`, pass the launching user; `upsertLtiContext` answers undefined for a course another live connection holds, and writes nothing on it.
13. As an LTI tool, have each connected platform's admin register the app again with a new registration link and re-point the platform's existing links at the new registration, then delete the old connection: the next launch through the new one takes its courses over with their channels and members. Until the delete, the old connection keeps them and they say it must register again.
14. Step 13 is the whole upgrade path for a connection made before this, since no app runs one in production; re-seed a database that holds such connections.
15. Where app code calls `ltiRegistrationRequest()`, pass the connection's id; where it signs for a platform with `currentSigningKey`, sign with `connectionSigningKey` of the connection.

## Verify

```sh
pnpm generate --hints "$(cat cella/alignments/20261119T1056-lti-nrps/hints.json)"
pnpm check
```
