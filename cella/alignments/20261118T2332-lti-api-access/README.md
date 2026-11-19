---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: AccessScope, AccessScopedEntityType, scopeAllows, requested_scopes, granted_scopes, ltiContextRole, organizationRoles, PlatformFetchOptions, service_accounts
---

# An installed LTI tool reads members through the API

An app runs `pnpm generate`, which adds `oauth_clients.requested_scopes`, `lti_installations.granted_scopes`, the API
and import columns of `lti_contexts` and `service_accounts.connection_id`. Access scopes gain `user:read`: app code that
lists the scopes by hand, or reads a scoped proof as one that never reads people, follows. The app-owned `ltiContextRole`
now also maps the roles of people a member import reads, who never launched.

## What & why

An installed LTI tool reads the people of a channel it is placed in with its own token, within the scopes an admin
granted. As an LTI tool, the app asks for `user:read` and, after a teacher's launch, a `lti.import-members` job makes
everyone the platform lists a member. It writes as a service account per connection (`connectionId`), which no list
shows and no API key reaches.

## Blast radius

Every app: its tests fail until `pnpm generate` adds the columns. An app with channels below the organization gets a
binding per placed channel, and imported members of such a channel arrive with the organization role its
`organizationRoles` maps to. No `clientCacheVersion` bump, no lens.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the columns, and no hand-written SQL follows.
2. Where app code lists access scopes by hand or switches over `AccessScope`, add `user:read`.
3. Check that `ltiContextRole` in `lti-context-channel.ts` answers every LTI role a platform lists, without a launch.
4. Where app code lists `service_accounts` itself, leave out rows with a `connection_id`, as rows with an `oauth_client_id`.
5. Import `PlatformFetchOptions` from `auth/flows/lti/helpers/platform-api.ts`.
6. Where an app test starts the job store through `getPgBoss`, unmock `#/lib/pg-boss`: the test setup records sends.

## Verify

```sh
pnpm generate
pnpm check
```
