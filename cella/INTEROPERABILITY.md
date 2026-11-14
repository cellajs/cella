# Interoperability

This document covers how systems outside the browser act on your app: who they are, how they prove it, what they may do and where they call.

### TL;DR

Systems outside the browser act on your app through the REST API and an MCP endpoint per organization, with tokens from the app's own OAuth server. Every caller is an actor with role bindings the permission engine understands. Access scopes may narrow what those bindings allow.

## Actors

Every actor is a row in `actors`, a user or a service account. A person without an account signs in as an [anonymous user](./ANONYMOUS_SESSIONS.md), never as a third kind, since every writer reference on the wire embeds an `ActorRef`.

A service account is tenant-scoped and holds role bindings like a member does. "Create API key" in organization settings makes one, named after the key, as a member of the organization. Creating or managing one takes `update` on the organization. An account keeps working on its own bindings after its creator leaves. The organization's remaining admins see and revoke it and its keys.

A service account is disabled, never deleted. The rows it wrote keep pointing at it. A row's provenance is its writer actor, and no table carries a provenance column.

## Proving who you are

Every caller gets the same OpenAPI contract and SDK. Routes open to machines take an API key or an access token. A request without valid proof is refused with a challenge that names the tenant's metadata. That metadata names a prefix of the request URL, not the request URL itself, since the REST API's resource identifier is the tenant URL.

### API keys

A key is shown once, at creation. Only its hash is stored. It travels as `Authorization: Bearer <key>` or `x-api-key`. The tenant in the URL must be the key's own, and a request that carries a browser `Origin` is refused, since keys are for servers.

A key can expire, be rolled or be revoked. After a roll the old key keeps working for an overlap window. A revoked key keeps its row as the audit trail. An app that needs other roles or several keys per account builds on the same routes.

### Access tokens

The app is its own authorization server, on the same origin under `/oauth` ([OAuth](./OAUTH.md)). A person consents on a screen that names the client and the scopes it asks for. The resulting token acts as that person in one tenant, masked by those scopes. People revoke their consents in their account settings. A service account gets a token from its API key through `client_credentials`.

Access tokens are signed JWTs, each for one tenant's resource: that tenant's REST API, or one organization's MCP endpoint. A token never crosses tenants. A token for an organization's MCP endpoint also works on that organization's REST routes, since its MCP tools run through them. A tenant's API token works at the MCP endpoint too. The token never travels to another resource server: an MCP tool call runs its REST route in the same process.

A guard verifies a token locally, without a call to the authorization server. It reads what the token rests on at every request. The next request sees a revoked grant or key and any membership change.

## What a caller may do

A key or token acts with its actor's role bindings, narrowed by its scopes and bounded by the tenant's quotas.

### Access scopes

Every entity type with a policy has `<type>:read` and `<type>:write`, and `write` implies `read`. A scope masks the actor's bindings in every permission check:

- **Narrowing only:** a key or token holding `attachment:read` reads what its role reads, nothing else.
- **Unknown scope:** fails closed.
- **No mask:** a session or a key issued without scopes is unmasked.
- **REST refusal:** answers as for an actor without the permission, with no `insufficient_scope` challenge.
- **MCP refusal:** names the scope to step up to.
- **One list:** the same ids appear in the OpenAPI `oauth2` scheme, discovery documents and consent screen.

### Quotas and limits

Tenant restrictions cap the active service accounts and live API keys a tenant holds. Machine calls pass a per-second burst limit. Routes that carry it also spend the tenant's hourly points budget. An app acting on a person's consent spends that person's budget, since both count per actor.

## The REST API

The REST API is the API the app's own frontend uses, described in one OpenAPI document that also generates the SDK. Resource routes follow the resource-oriented conventions of [aep.dev](https://aep.dev) as far as an offline-first app allows, and the API docs show every route's shape, status codes and limits. A machine caller reaches the routes open to machines, narrowed by its scopes.

Four behaviors hold across the API, and a client codes against them:

- **Concurrency.** A single channel or product answers with a strong `ETag`. A write that sends it back in `If-Match` applies only while nothing changed the resource since, else answers 412 `precondition_failed`. A `GET` with `If-None-Match` answers 304 while the tag holds.
- **Paging.** A list answers a page with a `nextPageToken` while more follow, passed back as `pageToken`. A token is opaque and bound to its list; an altered one is refused as `invalid_page_token`.
- **Mirroring.** Range reads with `afterSeq` and `untilSeq` return products in sync order, a chunk at a time, deletions as tombstones. After an absence longer than the activity window, a mirror reads everything again.
- **Updates.** A `PATCH` is a merge patch: a field left out keeps its value and `null` clears it. A client sends the fields it changed, and a product update sends them as field operations.

No key or token reaches an account-security route. It takes only a session that recently proved its user.

## The MCP endpoint

Each organization has an MCP endpoint that accepts only access tokens ([MCP](./MCP.md)). A client with no token is told where the metadata lives and to start with the read scopes. It consents through the OAuth server and comes back.

MCP tools are routes that opted in. A call the token's scopes do not cover answers with the scope to step up to, and the client re-consents.

## Changes to the API

A breaking change to a field ships with a lens ([Schema evolution](./SCHEMA_EVOLUTION.md)). For an expand window the API accepts the old and the new name, and the OpenAPI document shows the current shape. The old name retires once `X-Client-Version` shows every client past it. A client that sends its schema version in that header is accounted for when a name retires.
