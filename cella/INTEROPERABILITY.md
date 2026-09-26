# Interoperability

This document covers how systems outside the browser act on your app: the faces they connect to and the substrate of actors, keys, scopes and tokens under them.

### TL;DR

Your app has three machine-facing faces: the REST API, an OAuth authorization server, and an MCP endpoint per organization. All three run on one substrate. A caller is always an actor (a person or a service account), always holds role bindings the permission engine understands, and may carry a mask of access scopes that narrows what those bindings allow. There is no second permission vocabulary for machines.

## Who connects

| Caller | Holds | Face |
| --- | --- | --- |
| A server or CI job you own | An API key of a service account | REST API |
| An app a person consented to (a portfolio site, a partner integration) | An access token issued to that person | REST API, MCP |
| An AI client (Claude Desktop, VS Code) | An access token issued to that person, obtained through consent | MCP |
| A service acting on its own behalf | An access token from its API key (`client_credentials`) | REST API, MCP |

The OpenAPI contract and the generated SDK are the same for every caller ([Client](./CLIENT.md)); what differs is how the caller proves who it is.

## Face: REST API

Routes that accept a machine caller say so through their guard. `actorGuard` takes a session cookie, an API key, or an access token; `serviceGuard` takes only keys and tokens. An operation behind either is typed on `ActorContext`, which has no user row, so it cannot accidentally read one. Session-only routes keep `userGuard` ([AGENTS.md](./AGENTS.md#middleware--guards)).

An API key travels as `Authorization: Bearer <key>` or `x-api-key`. A request carrying one skips CSRF but is refused when it carries a browser `Origin`: keys are for servers. The tenant in the URL must be the key's own tenant: `tenantGuard` compares the two before loading the tenant row, so a key learns nothing about other tenants. Machine calls pass a burst limiter (30 per second per actor) and, on routes that carry it, the tenant's hourly points budget, keyed on tenant and actor.

## Face: OAuth

The app is its own authorization server, on the same origin under `/oauth`. A person is sent to a consent screen that names the client and the scopes it asks for; the resulting token acts as that person, masked by those scopes, in one tenant. Two kinds of client reach the consent screen: MCP clients identify themselves with a Client ID Metadata Document (an HTTPS URL, nothing pre-registered; a tenant can refuse them), and registered apps have a row in `oauth_clients` and are installed per tenant as a service account carrying the client id (consent refuses an app that is not installed; the installation route is not built yet). A service account is its own `client_credentials` client and needs neither a row nor consent. People see and revoke their consents under "Connected apps" in their account settings. Mechanics: [OAuth worker](../oauth/README.md).

## Face: MCP

Each organization has an MCP endpoint that accepts only access tokens. A client with no token is told where the metadata lives (RFC 9728), consents through the OAuth face, and comes back. MCP tools are routes that opted in; a call the token's scopes do not cover answers with the scope to step up to, and the client re-consents. Mechanics: [MCP worker](../mcp/README.md).

## The substrate

### Actors

Every actor is a row in `actors`, of kind `user` or `service`. Provenance columns (`createdBy`, `updatedBy`, `deletedBy`) reference actors, so a row written by a service account keeps a real foreign key. A service account is tenant-scoped, holds role bindings like a member does, and is disabled rather than deleted so provenance keeps pointing at it. Creating one is an organization admin's act, and the role it gets is capped at the creator's own.

### API keys

A key is `<slug>_sk_live_…` (or `_test_` outside production): a prefix, 32 random characters and a checksum. Only its hash is stored, with the prefix and the last four characters for display; the plaintext is shown once at creation. A key can expire, can be rolled (the new key is issued and the old one keeps working for an overlap window, in one transaction) and can be revoked, which keeps the row as the audit trail. The one-step "Create API key" in organization settings makes a service account named after the key, bound to the organization as a member; an app that needs several keys per account or other roles builds on the same routes.

### Access scopes

The scope vocabulary is derived from the policy matrix, never listed by hand: every entity type with a policy has `<type>:read` and `<type>:write`. A scope is a mask over the actor's bindings, applied at the end of every permission check: a key or token holding `attachment:read` can read what its account's role reads, and nothing else; `write` implies `read`; a scope the vocabulary no longer knows fails closed. A session, and a key issued without scopes, are unmasked. The same ids appear in the OpenAPI `oauth2` scheme, in discovery documents and on the consent screen, so the contract is one list.

### Tokens

Access tokens are RS256 JWTs the OAuth face signs: `sub` is the actor, `actor_kind` says which kind, `tenant_id` and the audience name one tenant's resource (the REST API of that tenant, or one organization's MCP endpoint), `scope` is the mask. A guard verifies the signature locally against a cached keystore (no token row, no call back to the authorization server) and then loads the actor: a cached read for a user, one row read for a service account. The audience check means a token can never cross tenants. Tokens live an hour; refresh tokens rotate.

### Guards

| Guard | Accepts | Sets |
| --- | --- | --- |
| `userGuard` | Session cookie | The user, memberships, actor |
| `serviceGuard` | API key or access token | The actor (service account, or the consenting user masked by the token) |
| `tokenGuard` | Access token only | Same as above; answers 401 with the RFC 9728 challenge |
| `actorGuard` | Any of the three | Whichever applies |
| `stepUpGuard` | After `userGuard`: a session that proved its user's presence again within ten minutes, never an impersonation | Nothing; refuses with 403 `step_up_required` and the methods the user can offer |

`tenantGuard` and `orgGuard` follow and read the actor's bindings, whatever proved it. `stepUpGuard` guards the account-security routes (factors, MFA, provider connect, account deletion, minting an API key; OAuth consent checks the same), so no API key or access token reaches them.

### Quotas and limits

Tenant restrictions cap `serviceAccount` (20) and `apiKey` (100) per tenant; only active accounts and live keys count, and `0` lifts the cap. Rate limits are keyed on the actor: a service account spends its own budget, and an app acting on a person's consent spends that person's.

## Where to look

| Piece | Path |
| --- | --- |
| Actors and provenance | `backend/src/modules/actors/`, `backend/src/db/utils/ids.ts`, provenance columns in `db/utils/product-columns.ts` and `channel-columns.ts` |
| Service accounts and keys | `backend/src/modules/service-accounts/` |
| Scopes | `shared/src/permissions/access-scopes.ts`, mask in `check-access.ts` and, for list queries, `backend/src/permissions/collection-scope.ts` |
| Authorization server | `backend/src/modules/oauth-server/`, process entry in `oauth/` |
| MCP | `backend/src/modules/mcp/`, MCP tools registered by `createXRoute` |
| Guards | `backend/src/middlewares/guard/` |
