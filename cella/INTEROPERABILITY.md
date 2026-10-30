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

A route accepts a machine caller through its guard, `actorGuard` or `serviceGuard`. Its operation is typed on `ActorContext`, which has no user row, so it cannot read one by accident. Account-security routes ask a session that recently proved its user, so no key or token reaches them.

An API key travels as `Authorization: Bearer <key>` or `x-api-key`. A request carrying one skips CSRF but is refused when it carries a browser `Origin`: keys are for servers. The tenant in the URL must be the key's own, checked before the tenant row loads, so a key learns nothing about other tenants.

A caller that mirrors products through range reads (`afterSeq`/`untilSeq`) reads them in full again after an absence longer than the activity window, since an expired tombstone sends nothing.

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
