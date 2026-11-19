---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: AccessScope, AccessScopedEntityType, accessScopes.all, scopeAllows, requested_scopes, granted_scopes, ltiContextRole, ltiContextTypes, organizationRoles, PlatformFetchOptions, service_accounts, oauth_client_id, authorizationServer
---

# An installed LTI tool reads members through the API

An app runs `pnpm generate`, which adds `oauth_clients.requested_scopes`, `lti_installations.granted_scopes`, the API
and import columns of `lti_contexts`, `service_accounts.connection_id` and one installation per tenant and
`oauth_client_id`. Access scopes gain `user:read`, which only an installed LTI tool can be granted: what an API key, a
consent or a discovery document offers is `accessScopes.offered`, without it. The app-owned `ltiContextRole` now also
maps the roles of people a member import reads, who never launched.

## What & why

As a platform, the app lets an admin grant an installed LTI tool access scopes at approval or later on its tile, none by
default, and only those a route for installed LTI tools reads (`ltiToolScopes`). The LTI tool then reads the people of a
course it has a tab in, or below, with its own token: the course is the channel a launch names as its context
(`ltiContextTypes`), and the access is read from the tabs at every request, never stored. Only a launch of an LTI tool
granted a scope names the API. The platform's configuration names its issuer as the authorization server that token's
assertion addresses; an assertion must expire within five minutes, and the key set it is checked against must lie on the
domains the LTI tool declares, as its launch addresses must.

As an LTI tool, the app asks for `user:read` and, after a teacher's launch, a `lti.import-members` job makes everyone
the platform lists a member. It writes as a service account per connection (`connectionId`), which no tenant route
reaches, no API key opens and the quota leaves out; deleting the connection keeps it, disabled. The LTI connections card
lists each connection's courses with how their last import ran, read from `listLtiContexts`.

A launch and an import give roles by one rule (`applyLtiRole`): never an organization role that may update the
organization, as the permission engine decides. Both take a seat of the tenant's member limit under its quota lock, as an
invitation now does too, and neither joins an archived channel: such a launch is refused with a page. The app signs a
client assertion only for a connection whose token endpoint, authorization server and API lie on its issuer's origin,
and registration refuses a platform whose configuration breaks that.

## Blast radius

Every app: its tests fail until `pnpm generate` adds the columns. An app with channels below the organization: an
installed LTI tool reads the course its tab sits in or below, as `ltiContextTypes` names it, and imported members of such
a channel arrive with the organization role its `organizationRoles` maps to. An LTI tool registered at the app as a
platform before this asked for no scope: it gets no token until it registers again. App code that gives a tenant two
service accounts for one registered app now fails the unique index. An app whose `ltiContextRole` maps an LTI role to an organization role that may update the
organization now gets the highest role below it, at a launch too. An LTI connection registered before this keeps
addressing the platform's token endpoint, which a platform on the template accepts only where its OAuth worker sees the
public host. No `clientCacheVersion` bump, no lens.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds the columns, and no hand-written SQL follows.
2. Where app code lists access scopes by hand or switches over `AccessScope`, add `user:read`; where it offers scopes to
   an API key, a consent or a discovery document, read `accessScopes.offered`.
3. Check that `ltiContextRole` in `lti-context-channel.ts` answers every LTI role a platform lists, without a launch.
4. Where app code lists `service_accounts` itself, leave out rows with a `connection_id`, as rows with an `oauth_client_id`.
5. Import `PlatformFetchOptions` from `auth/flows/lti/helpers/platform-api.ts`.
6. Where an app test starts the job store through `getPgBoss`, unmock `#/lib/pg-boss`: the test setup records sends.
7. For a connection to a platform on the template registered before this, set `config.authorizationServer` to the
   connection's `issuer`, or register it again, so its imports address the issuer.
8. As a platform, ask the admins of LTI tools registered before this to register them again where API access is
   wanted: those registrations asked for no scope.

## Verify

```sh
pnpm generate
pnpm check
```
