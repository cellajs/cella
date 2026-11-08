# Interoperability

This document covers how systems outside the browser act on your app: the faces they connect to and the substrate of actors, keys, scopes and tokens under them.

### TL;DR

Your app has three machine-facing faces: the REST API, an OAuth authorization server, and an MCP endpoint per organization. All three run on one substrate. Every caller is an actor with role bindings the permission engine understands. Access scopes may narrow what those bindings allow.

## Who connects

| Caller | Holds | Face |
| --- | --- | --- |
| A server or CI job you own | An API key of a service account | REST API |
| An app a person consented to, such as a partner integration | An access token issued to that person | REST API, MCP |
| An AI client, such as Claude Desktop | An access token issued to that person, obtained through consent | MCP |
| A service acting on its own behalf | An access token its API key gets through `client_credentials` | REST API, MCP |

The OpenAPI contract and the generated SDK are the same for every caller. Only the proof of who it is differs.

## Face: REST API

The REST API is the API the app's own frontend uses, described in one OpenAPI document that also generates the SDK. Resource routes follow the resource-oriented conventions of [aep.dev](https://aep.dev) as far as an offline-first app allows, and the API docs show every route's shape, status codes and limits. A machine caller proves itself with an API key or an access token and gets the same contract as a browser session, narrowed by its scopes.

Three behaviors hold across the API, and a client codes against them:

- **Concurrency.** A single channel or product answers with a strong `ETag`. A write that sends it back in `If-Match` applies only while nothing changed the resource since, else answers 412 `precondition_failed`. A `GET` with `If-None-Match` answers 304 while the tag holds.
- **Paging.** A list answers a page with a `nextPageToken` while more follow, passed back as `pageToken`. A token is opaque and bound to its list; an altered one is refused as `invalid_page_token`.
- **Mirroring.** Range reads with `afterSeq` and `untilSeq` return products in sync order, a chunk at a time, deletions as tombstones. After an absence longer than the activity window, a mirror reads everything again.

Account-security routes take only a session that recently proved its user, so no key or token reaches them.

## Face: OAuth

The app is its own authorization server, on the same origin under `/oauth`. A person consents on a screen that names the client and the scopes it asks for. The resulting token acts as that person in one tenant, masked by those scopes. People revoke their consents in their account settings.

## Face: MCP

Each organization has an MCP endpoint that accepts only access tokens. A client with no token is told where the metadata lives and to start with the read scopes. It consents through the OAuth face and comes back.

MCP tools are routes that opted in. A call the token's scopes do not cover answers with the scope to step up to, and the client re-consents.

## The substrate

### Actors

Every actor is a row in `actors`, a user or a service account.

A user and a service account are the only actor kinds. A person without an account signs in as a [provisional user](./AUTHENTICATION.md#sign-up), never as a third kind, since every writer reference on the wire embeds an `ActorRef`.

A service account is tenant-scoped and holds role bindings like a member does. It is disabled, never deleted, so the rows it wrote keep pointing at it.

Creating or managing one takes `update` on the organization. An account keeps working on its own bindings after its creator leaves. The organization's remaining admins see and revoke it and its keys.

A row's provenance is its writer actor, and no table carries a provenance column. A sync or import that a connection runs acts as a service account of its own. The rows it wrote name that account.

### API keys

"Create API key" in organization settings makes a service account named after the key, as a member of the organization. The plaintext is shown once, at creation. Only its hash is stored.

A key travels as `Authorization: Bearer <key>` or `x-api-key`. The tenant in the URL must be the key's own, and a request that carries a browser `Origin` is refused, since keys are for servers.

A key can expire, be rolled or be revoked. After a roll the old key keeps working for an overlap window. A revoked key keeps its row as the audit trail. An app that needs other roles or several keys per account builds on the same routes.

### Access scopes

Every entity type with a policy has `<type>:read` and `<type>:write`, and `write` implies `read`. A scope masks the actor's bindings in every permission check:

- **Narrowing only:** a key or token holding `attachment:read` reads what its role reads, nothing else.
- **Unknown scope:** fails closed.
- **No mask:** a session or a key issued without scopes is unmasked.
- **REST refusal:** answers as for an actor without the permission, with no `insufficient_scope` challenge.
- **MCP refusal:** names the scope to step up to.
- **One list:** the same ids appear in the OpenAPI `oauth2` scheme, discovery documents and consent screen.

### Tokens

A machine request the REST API refuses for want of valid proof names the tenant's metadata in its challenge. That metadata names a prefix of the request URL, not the request URL itself. The REST API's resource identifier is the tenant URL.

Access tokens are signed JWTs, each for one tenant's resource: that tenant's REST API, or one organization's MCP endpoint. A token never crosses tenants.

A token for an organization's MCP endpoint also works on that organization's REST routes, since its MCP tools run through them. A tenant's API token works at the MCP endpoint too. The token never travels to another resource server: an MCP tool call runs its REST route in the same process.

A guard verifies a token locally, without a call to the authorization server. It reads what the token rests on at every request. The next request sees a revoked grant or key and any membership change.

### Quotas and limits

Tenant restrictions cap the active service accounts and live API keys a tenant holds. Machine calls pass a per-second burst limit. Routes that carry it also spend an hourly points budget the tenant sets. An app acting on a person's consent spends that person's budget, since both count per actor.
