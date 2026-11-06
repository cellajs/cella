# Interoperability

This document covers how systems outside the browser act on your app: the faces they connect to and the substrate of actors, keys, scopes and tokens under them.

### TL;DR

Your app has three machine-facing faces: the REST API, an OAuth authorization server, and an MCP endpoint per organization. All three run on one substrate. A caller is always an actor (a person or a service account), always holds role bindings the permission engine understands, and may carry access scopes that narrow what those bindings allow.

## Who connects

| Caller | Holds | Face |
| --- | --- | --- |
| A server or CI job you own | An API key of a service account | REST API |
| An app a person consented to (a portfolio site, a partner integration) | An access token issued to that person | REST API, MCP |
| An AI client (Claude Desktop, VS Code) | An access token issued to that person, obtained through consent | MCP |
| A service acting on its own behalf | An access token from its API key (`client_credentials`) | REST API, MCP |

The OpenAPI contract and the generated SDK are the same for every caller; what differs is how the caller proves who it is.

## Face: REST API

Resource routes follow the resource-oriented conventions of [aep.dev](https://aep.dev). A path alternates literal collections and ids (`/tenants/{tenantId}/organizations/{organizationId}/attachments/{attachmentId}`), and `-` stands for any parent: `/tenants/-/organizations` lists the organizations of every tenant the caller sees. An update is a `PATCH` with JSON Merge Patch semantics (RFC 7396): an absent field stays, `null` clears it, an object merges member by member (a `null` inside removes that member, which then reads its default) and an array is replaced, sent as `application/json` or `application/merge-patch+json`. A product update is the exception: it sends field operations with their timestamps (`ops` and `stx`), which the sync engine merges field by field with concurrent edits. An action is a custom method at `<resource>:<verb>`, a `POST`, or a `GET` when it changes nothing, such as `POST …/organizations/{organizationId}:publish`. A create answers 201 with the resource and a delete answers 204. In the OpenAPI document each resource schema carries `x-aep-resource` (AEP-4): its type, names, parent types and path patterns, read from the routes that answer with it, so an app's own entities carry it too. The auth, OAuth and MCP routes, the app stream and the yjs routes follow the protocols they implement.

A single channel or product answers `GET` and `PATCH` with a strong `ETag` that versions its own fields, not its `included` data or counts. Send it back in `If-Match` on a `PATCH` or a custom method and the write applies only while nothing changed the resource since, else it answers 412 `precondition_failed`; a `GET` with `If-None-Match` answers 304 while the tag holds.

A list answers a page: its `results`, the `totalSize` of the list and, while more follow, a `nextPageToken`. The next request passes that token as `pageToken` with every other param unchanged; only `maxPageSize` (absent or 0 for the default, above the maximum read as the maximum) and `skip` may change, and a token is opaque, bound to its list and refused as `invalid_page_token` when it was altered or the params changed. `skip` jumps over results, from the start or from a token. A list that orders takes `orderBy`, a field optionally followed by `asc` or `desc`.

Four choices depart from those conventions. Field and parameter names are camelCase, as in the JSON of Google's own resource APIs, where AEP-140 asks for snake_case: one spelling runs from the table through the SDK into the frontend, so code that moves a field from one shape to another names it once. Ids are UUID v7 the client mints, since an offline create needs its id before the server answers. A batch create or delete (`:batch-create`, `:batch-delete`) applies what it can and lists the ids it rejected, where an AEP batch would fail whole. The membership routes name their channel in `entityType` and `entityId`, since channel types are app config and one operation per action keeps a client independent of them.

A route accepts a machine caller through its guard, `actorGuard` or `serviceGuard`. Its operation is typed on `ActorContext`, which has no user row, so it cannot read one by accident. Account-security routes ask a session that recently proved its user, so no key or token reaches them.

An API key travels as `Authorization: Bearer <key>` or `x-api-key`. A request carrying one skips CSRF but is refused when it carries a browser `Origin`: keys are for servers. The tenant in the URL must be the key's own, checked before the tenant row loads, so a key learns nothing about other tenants.

A caller that mirrors products through range reads (`afterSeq`/`untilSeq`) reads them in full again after an absence longer than the activity window, since an expired tombstone sends nothing. A range read is a sync chunk, not a page: it takes no `pageToken` or `skip`, and the next chunk starts after the last position received.

## Face: OAuth

The app is its own authorization server, on the same origin under `/oauth`. A person consents on a screen that names the client and the scopes it asks for, and the resulting token acts as that person, masked by those scopes, in one tenant. MCP clients, registered apps and service accounts each reach it in their own way, and people revoke their consents in their account settings.

## Face: MCP

Each organization has an MCP endpoint that accepts only access tokens. A client with no token is told where the metadata lives and that it should start with the read scopes, consents through the OAuth face, and comes back. MCP tools are routes that opted in; a call the token's scopes do not cover answers with the scope to step up to, and the client re-consents.

## The substrate

### Actors

Every actor is a row in `actors`, a user or a service account, and the writer columns of channel and product rows reference it. A service account is tenant-scoped, holds role bindings like a member does, and is disabled, never deleted, so the rows it wrote keep pointing at it. Creating or managing one takes `update` on the organization, and nobody gives one, or a key for one, a role above their own. An account keeps working on its own bindings after its creator leaves, and the organization's remaining admins see and revoke it and its keys.

### API keys

Only a key's hash is stored, with its prefix and last four characters for display; the plaintext is shown once at creation. A key can expire, can be rolled (the old key keeps working for an overlap window) and can be revoked, which keeps the row as the audit trail. "Create API key" in organization settings makes a service account named after the key, a member of the organization; an app that needs other roles or several keys per account builds on the same routes.

### Access scopes

The scope vocabulary is derived from the policy matrix, never listed by hand: every entity type with a policy has `<type>:read` and `<type>:write`, and `write` implies `read`. A scope masks the actor's bindings in every permission check: a key or token holding `attachment:read` can read what its account's role reads, and nothing else. An unknown scope fails closed; a session, and a key issued without scopes, are unmasked. The same ids appear in the OpenAPI `oauth2` scheme, in discovery documents and on the consent screen, so the contract is one list.

### Tokens

Access tokens are signed JWTs, each for one tenant's resource: the REST API of that tenant, or one organization's MCP endpoint, so a token never crosses tenants. A token for an organization's MCP endpoint also works on that organization's REST routes, which its tools run through, and a tenant's API token works at the MCP endpoint. A guard verifies one locally, with no call to the authorization server, and reads what it rests on at every request: revoking a grant or a key, or changing a membership, counts at the next request.

### Quotas and limits

Tenant restrictions cap the active service accounts and live API keys a tenant holds (`appConfig.defaultRestrictions`, `0` lifts a cap). Machine calls pass a per-second burst limit and, on routes that carry it, the tenant's hourly points budget, both per actor: an app acting on a person's consent spends that person's budget.
