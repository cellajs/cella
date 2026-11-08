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

Resource routes follow the resource-oriented conventions of [aep.dev](https://aep.dev):

- **Paths** alternate literal collections and ids, as `/tenants/{tenantId}/organizations/{organizationId}`.
- **A `-`** stands for any parent: `/tenants/-/organizations` spans every tenant the caller sees.
- **An update** is a `PATCH` with JSON Merge Patch semantics (RFC 7396).
- **An action** is a custom method at `<resource>:<verb>`, such as `POST …/organizations/{organizationId}:publish`.
- **A create** answers 201 with the resource, and a delete answers 204.

In a merge patch, an absent field stays, `null` clears it and an array is replaced whole. A product update is the exception. It sends field operations with their timestamps, which the sync engine merges field by field with concurrent edits. The auth, OAuth and MCP routes, the app stream and the yjs routes follow the protocols they implement.

A single channel or product answers `GET` and `PATCH` with a strong `ETag`. The tag versions the resource's own fields, not its `included` data or counts.

Send it back in `If-Match` on a `PATCH` or a custom method. The write then applies only while nothing changed the resource since. Otherwise the write answers 412 `precondition_failed`. A `GET` with `If-None-Match` answers 304 while the tag holds.

A list answers a page: its `results`, the list's `totalSize` and, while more follow, a `nextPageToken`. The next request passes that token as `pageToken` and keeps every other param unchanged. Only `maxPageSize` and `skip` may change.

A token is opaque and bound to its list. A request with an altered token or changed params is refused as `invalid_page_token`.

`skip` jumps over results, from the start or from a token. A list that orders takes `orderBy`: a field, optionally followed by `asc` or `desc`.

Four choices depart from those conventions:

- **camelCase names,** where AEP-140 asks for snake_case, so one spelling runs from table to frontend.
- **Client-minted ids:** UUID v7, since an offline create needs its id before the server answers.
- **Partial batches:** a batch create or delete applies what it can and lists the ids it rejected.
- **Membership routes** name their channel in `entityType` and `entityId`, since channel types are app config.

A field AEP standardizes still takes its words, such as a person's `givenName` (AEP-148) or `languageCode` (AEP-143).

A route accepts a machine caller through its guard, `actorGuard` or `serviceGuard`. Its operation is typed on `ActorContext`, which has no user row to read by accident. Account-security routes ask a session that recently proved its user, so no key or token reaches them.

An API key travels as `Authorization: Bearer <key>` or `x-api-key`. A request carrying one skips CSRF. It is refused when it carries a browser `Origin`, since keys are for servers. The tenant in the URL must be the key's own. That check runs before the tenant row loads, so a key learns nothing about other tenants.

A caller can mirror products through range reads with `afterSeq` and `untilSeq`. After an absence longer than the activity window, it reads them in full again, since an expired tombstone sends nothing. A range read is a sync chunk, not a page. It takes no `pageToken` or `skip`. The next chunk starts after the last position received.

## Face: OAuth

The app is its own authorization server, on the same origin under `/oauth`. A person consents on a screen that names the client and the scopes it asks for. The resulting token acts as that person in one tenant, masked by those scopes. People revoke their consents in their account settings.

## Face: MCP

Each organization has an MCP endpoint that accepts only access tokens. A client with no token is told where the metadata lives and to start with the read scopes. It consents through the OAuth face and comes back.

MCP tools are routes that opted in. A call the token's scopes do not cover answers with the scope to step up to, and the client re-consents.

## The substrate

### Actors

Every actor is a row in `actors`, a user or a service account. The writer columns of channel and product rows reference it.

A service account is tenant-scoped and holds role bindings like a member does. It is disabled, never deleted, so the rows it wrote keep pointing at it.

Creating or managing one takes `update` on the organization. An account keeps working on its own bindings after its creator leaves. The organization's remaining admins see and revoke it and its keys.

A user and a service account are the only actor kinds. A person without an account signs in as a [provisional user](./AUTHENTICATION.md#sign-up), never as a third kind, since every writer reference on the wire embeds an `ActorRef`.

A row's provenance is its writer actor. A sync or import that a connection runs acts as a service account of its own, so the rows it wrote name it, and no table carries a provenance column.

### API keys

Only a key's hash is stored, with its prefix and last four characters for display. The plaintext is shown once, at creation.

A key can expire, be rolled or be revoked. After a roll the old key keeps working for an overlap window. A revoked key keeps its row as the audit trail.

"Create API key" in organization settings makes a service account named after the key, as a member of the organization. An app that needs other roles or several keys per account builds on the same routes.

### Access scopes

The scope vocabulary is derived from the policy matrix, never listed by hand. Every entity type with a policy has `<type>:read` and `<type>:write`, and `write` implies `read`. A scope masks the actor's bindings in every permission check:

- **Narrowing only:** a key or token holding `attachment:read` reads what its role reads, nothing else.
- **Unknown scope:** fails closed.
- **No mask:** a session or a key issued without scopes is unmasked.
- **REST refusal:** answers as for an actor without the permission, with no `insufficient_scope` challenge.
- **MCP refusal:** names the scope to step up to.
- **One list:** the same ids appear in the OpenAPI `oauth2` scheme, discovery documents and consent screen.

### Tokens

Access tokens are signed JWTs, each for one tenant's resource: that tenant's REST API, or one organization's MCP endpoint. A token never crosses tenants.

A token for an organization's MCP endpoint also works on that organization's REST routes, since its MCP tools run through them. A tenant's API token works at the MCP endpoint too. An MCP tool call runs its REST route in the same process, so the token never travels to another resource server.

A guard verifies a token locally, without a call to the authorization server. It reads what the token rests on at every request. The next request sees a revoked grant or key and any membership change.

A machine request the REST API refuses for want of valid proof names the tenant's metadata in its challenge. The REST API's resource identifier is the tenant URL. Its metadata therefore names a prefix of the request URL, not the request URL itself.

### Quotas and limits

Tenant restrictions cap the active service accounts and live API keys a tenant holds. Machine calls pass a per-second burst limit. Routes that carry it also spend an hourly points budget the tenant sets. Both count per actor, so an app acting on a person's consent spends that person's budget.
