---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: phase:, /:tenantId/:organizationId, ${tenantId}/${organizationId}, {tenantId}/{organizationId}, /memberships/pending, /memberships/members, /memberships/check, /unseen/counts, /notifications/preferences, /notifications/read, /system/invite, /system/newsletter, /users/users, /check-slug, /presigned-urls, /tenants/self, /me/mfa, /me/leave, getAttachments, deleteAttachments
---

# Resource routes follow aep.dev: new paths, PATCH and :verb custom methods

Every resource route moves to an aep.dev path under `/tenants/{tenantId}/organizations/{organizationId}`, updates
are `PATCH`, actions and batches are custom methods (`…/attachments:batch-delete`, `…/{organizationId}:publish`), and
operationIds follow (`getAttachments` is `listAttachments`). An app renames its SDK calls and path params, drops
`phase` from its module mounts, moves its own routes to the conventions `createXRoute` now enforces at load, and
rewrites URLs it writes by hand.

## What & why

Paths alternate kebab-case collections and ids named `{<singular>Id}`; `-` is the wildcard parent
(`GET /tenants/-/organizations`). A route declares a custom method as the last segment `/~verb`; the server routes
`:verb` there and the document shows `:verb`. Batch deletes take their ids in a POST body, a hard delete answers 204,
a create 201. `createXRoute` refuses `put`, a body on `get` or `delete`, and misnamed segments or verbs. The OAuth
resource URIs move under `/tenants/` with the routes.

## Blast radius

Every app that adds routes, calls the SDK or writes API URLs by hand. No database change. `clientCacheVersion` moves.
MCP tool names follow the operationIds, and access tokens for the old resource URIs stop working, so MCP clients and
integrations authorize again.

## Run

No script: manual.

## Manual steps

1. Run `pnpm sdk`, then rename what typecheck flags: SDK functions and types, path params (`id` to `attachmentId`, `membershipId`, `invitationId`, `serviceAccountId`, `apiKeyId`, `connectionId`, `connectedAppId`, `userId`).
2. Replace `handleMembershipInvitation` with `acceptInvitation` or `rejectInvitation`; `leaveMembership` and `removePushSubscription` take their input as `body`.
3. Remove `phase` from every `routes` entry of the app's `defineBackendModule` calls; mount a product module at `/tenants/:tenantId/organizations/:organizationId/<plural>` as `attachment-module.ts` does.
4. Fix each app route the load check names (`pnpm sdk` loads them): `put` becomes `patch`, a delete with a body becomes `post` at `/~batch-delete`, an action sub-path becomes `/~<verb>` with an operationId that leads with the verb.
5. Name the id a route addresses `{<singular>Id}` with `tenantOrgParamSchema.extend({ <singular>Id: validIdSchema })`; `idInTenantOrgParamSchema`, `tenantIdParamSchema`, `entityIdParamSchema` and `relatableUserIdParamSchema` are gone.
6. Rewrite hand-written URLs (fetch, `sendBeacon`, stories, tests) to the paths in `sdk/gen/openapi.json`, a custom method as `<resource>:<verb>`.
7. If the app has a `cella/pentest.app.ts`, spell each `skip` entry as `sdk/gen/openapi.json` does (`POST /tenants/{tenantId}/organizations/{organizationId}/memberships:batch-delete`) and rename its `params` keys to the new path params. The scan leaves out only an exact match, so an old entry lets it call a route that ends its session or deletes its data; `pnpm cella pentest` warns about an entry that matches no route.
8. Expect 201 from `createTenant`, `createConnection` and `createPushSubscription`, and 204 without a body from `deleteConnection` and `deleteConnectedApp`.
9. In MCP clients and tests, call the tools by their new names (`listAttachments`, `batchDeleteAttachments`) with `attachmentId` in place of `id`.
10. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```
