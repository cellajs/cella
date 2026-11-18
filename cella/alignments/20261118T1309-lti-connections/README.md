---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Connections and tokens take an LTI kind

An app adds `'lti-registration'`, `'lti-tool-registration'`, `'lti-launch'` and `'lti-nonce'` to `tokenKinds`,
`ltiPlatform: false` to `has` and `ltiFrameAncestors: [] as string[]` in its `config.default.ts`, adopts the pinned
`launch-context.ts` and `lti-context-channel.ts`, adds `embeddedChannelRouteConfig` to its pinned `routes-config.tsx`,
and runs `pnpm generate`. Code of its own that reads `connection.federation` handles null, a map keyed by `BaseAuthStrategies` adds `lti`, a switch over a service
account's `status` handles `pending`, and a call that passes a `TokenKind` to `readBoundToken`, `findLiveBoundToken` or
`spendCookieToken` passes an `AddressedTokenKind`.

## What & why

The app registers as an LTI tool at a platform by a one-use link. `connections` takes kind `lti` with `issuer` and
`clientId`, and `federation` becomes nullable. A token row carries `email` or `tenantId`, exactly one: the
registration link carries the tenant. `enabledAuthStrategies` may name `lti`, refused at config load without `services.oauth`.

As an LTI platform (`has.ltiPlatform`, refused at config load without `services.oauth`), the app takes an LTI tool's
registration with a one-use token. The registration is an `oauth_clients` row with LTI columns, private to a tenant,
which the provider and the grant policy never read. Its installation is a service account, `pending` until an admin
approves it, with a row in the new `lti_installations` table.

A resource link places an approved installation in a channel (the new `lti_resource_links` table) and shows as a tab of
that channel. A launch is a one-use `lti-launch` token, which names its resource link in the new `tokens` column
`lti_resource_link_id`. Which channels are LTI contexts and which LTI roles an app role sends are the app's call, in the
pinned `backend/src/modules/lti-platform/launch-context.ts`. The frontend CSP allows HTTPS frames while
`has.ltiPlatform` is on.

As an LTI tool, the app receives a launch: the login initiation and the launch post (both left out of the CSRF check),
a state proof through platform storage, and a finish route that checks the ID token, finds or creates the person by an
identity of the new kind `lti` (the platform's issuer as `provider`, its `sub` as `subject`) and starts an embedded
session. That session has the sign-in method `lti` and lives in its own cookie, `SameSite=None; Partitioned`; a request
reads it only when it carries the `X-Embedded-Session: 1` header or the `embeddedSession=1` query marker, and its writes
need `Sec-Fetch-Site: same-origin`. A launch's nonce is a one-use `lti-nonce` token naming its connection. Which channel
an LTI context becomes, how that channel is created and how LTI roles map to its roles are the app's call, in the pinned
`backend/src/modules/auth/flows/lti/lti-context-channel.ts`; the new `lti_contexts` table records each context and its
channel.

The launch ends on an embedded page under `/embed/`: a layout without app chrome that never sends anyone to sign in.
`embeddedChannelRouteConfig` in the pinned `frontend/src/routes-config.tsx` names the embedded page per channel type,
and a type without one opens its organization's. An embedded document keeps its own user, databases, leader tab and
messages apart from the app's other documents on its origin. Only a document under `/embed/` may be framed, by the
origins `ltiFrameAncestors` lists per mode (none by default), and it sends no `X-Frame-Options`. The LTI vocabulary
(claims, LIS roles, configuration members) moved to `backend/src/lib/lti-vocabulary.ts`.

## Blast radius

Every app: the template code names the new token kinds, and the schema changes need a migration. No lens or
`clientCacheVersion` change. An app that never reads connections, tokens or service accounts itself has only the config
lines and the migration to do.

## Run

No script: manual.

## Manual steps

1. Add `'lti-registration'`, `'lti-tool-registration'`, `'lti-launch'` and `'lti-nonce'` to `tokenKinds` in
   `shared/config/config.default.ts`.
2. Add `ltiPlatform: false` to `has` and `ltiFrameAncestors: [] as string[]` in the same file. A mode whose
   `enabledAuthStrategies` names `lti` lists the origins of the platforms that launch the app there.
3. Copy `backend/src/modules/lti-platform/launch-context.ts` from the template: it is pinned, and the upgrade leaves it
   to the app. Its default sends every channel as an LTI context of type Group, Instructor for a role the hierarchy marks
   as elevated and Learner for any other. Change the two functions where the app's channels or roles mean otherwise.
4. Copy `backend/src/modules/auth/flows/lti/lti-context-channel.ts` from the template: it is pinned too. Its default
   makes every LTI context the organization, creates nothing and gives every launch the least privileged organization
   role. An app whose course is a channel below the organization names that type, creates the channel in
   `createLtiContextChannel` (named after the course, inside the launch's transaction) and maps LTI roles in
   `ltiContextRole`; never to an elevated organization role.
5. Add an `lti` entry wherever app code maps every `AuthStrategy` or `IdentityKind`, such as a `c:<strategy>` label
   in a locale of its own.
6. Run `pnpm generate`: it adds the columns, the `lti_installations`, `lti_resource_links` and `lti_contexts` tables,
   check constraints, indexes and grants, and needs no hints or hand-written SQL.
7. Fix what the typecheck reports in app-owned code. `guardNavTabs`, `resolveChannelTabs` and a tabs menu read
   `NavTabOptions`, whose tabs may carry `text` in place of `label`.
8. Add `embeddedChannelRouteConfig` to the pinned `frontend/src/routes-config.tsx`, as the template has it. An app
   whose LTI context is a channel below the organization adds an entry for that type and a route under
   `frontend/src/routes/embed/` that loads the channel in its `beforeLoad` and renders its content without chrome, as
   `routes/embed/$tenantId.$organizationSlug/organization.tsx` does for the organization.
9. Optional: a channel layout of the app's own shows resource link tabs once it has a `$tool` child route rendering
   `SlotTabHost`, and its `beforeLoad` passes `linkedTabs` from `loadLtiResourceLinkTabs` to `guardNavTabs`, as the
   organization layout does.

## Verify

```sh
pnpm generate
pnpm check
```
