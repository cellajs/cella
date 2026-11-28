# Interoperability

This document explains how other software reaches your app through [OpenAPI](https://spec.openapis.org/oas/v3.1.0), [OAuth 2.1](https://oauth.net/2.1/), [MCP](https://modelcontextprotocol.io) and [LTI](https://www.1edtech.org/standards/lti), and which open standards the template follows.

### TL;DR

Other systems reach your app through standards they already speak: a client generated from OpenAPI, an AI assistant over MCP, a learning platform over LTI. Every caller is an actor with role bindings the permission engine understands, and access scopes may narrow what those bindings allow.

## Identity

An actor is who a request acts as, a row in `actors`: a user or a service account. A person without an account signs in as an [anonymous user](./ANONYMOUS_SESSIONS.md), never as a third kind, since every writer reference on the wire embeds an `ActorRef`.

A person's sign-in rests on three standards:

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OpenID Connect](https://openid.net/developers/how-connect-works/) | Institution sign-in through a federation | In full |
| [WebAuthn](https://www.w3.org/TR/webauthn/) | Passkeys, as the first or the second factor | In full |
| [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) | Authenticator apps (TOTP) | In full |

A service account is how software acts in one tenant: it holds role bindings like a member does. "Create API key" in organization settings makes one, named after the key, as a member of the organization. Creating or managing one takes `update` on the organization. An account keeps working on its own bindings after its creator leaves. The organization's remaining admins see and revoke it and its keys.

A service account is disabled, never deleted. The rows it wrote keep pointing at it. A row's provenance is its writer actor, and no table carries a provenance column.

## Authorization

A key or token acts with its actor's role bindings, narrowed by its scopes and bounded by the tenant's quotas. Routes open to machines take an API key or an access token. No key or token reaches an account-security route: it takes only a session that recently proved its user.

A request without valid proof is refused with a challenge that names the tenant's metadata. That metadata names a prefix of the request URL, not the request URL itself, since the REST API's resource identifier is the tenant URL.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OAuth 2.1](https://oauth.net/2.1/) | The app's own authorization server | In full |
| [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) | PKCE on every authorization code | In full |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) and [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) | The server and resource metadata a client discovers | In full |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) | A token names one tenant's API or one organization's MCP endpoint | In full |
| [Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/), IETF draft | An MCP client names itself by the URL of its metadata | In full; registration by RFC 7591 is not served |

### API keys

An API key is a service account's proof, shown once, at creation. Only its hash is stored. It travels as `Authorization: Bearer <key>` or `x-api-key`. The tenant in the URL must be the key's own, and a request that carries a browser `Origin` is refused, since keys are for servers.

A key can expire, be rolled or be revoked. After a roll the old key keeps working for an overlap window. Your app can add other roles or several keys per account on the same routes.

### Access tokens

An access token lets a client act for a person, or as itself. The app is its own authorization server, on the same origin under `/oauth` ([OAuth](./OAUTH.md)). A person consents on a screen that names the client and the scopes it asks for. The resulting token acts as that person in one tenant, masked by those scopes. People revoke their consents in their account settings.

A service account gets a token from its API key through `client_credentials`, and an installed LTI tool with an assertion signed by the key it registered. These two act as themselves: no person consents, and their own bindings and scopes decide.

Access tokens are signed JWTs, each for one tenant's resource: that tenant's REST API, or one organization's MCP endpoint. A token never crosses tenants. Inside its tenant:

- **A tenant's API token** also works at the MCP endpoint.
- **A token for an organization's MCP endpoint** also works on that organization's REST routes, since its MCP tools run through them.
- **An installed LTI tool's token** works only on the routes for installed LTI tools.

A token never travels to another resource server: an MCP tool call runs its REST route in the same process. A token's next request sees a revoked grant or key and any membership change.

### Access scopes

Access scopes narrow a key or token: every entity type with a policy has `<type>:read` and `<type>:write`, and `write` implies `read`. People have `user:read` alone, which only an installed LTI tool can be granted, and a key or token whose scopes leave it out reads no one. A scope masks the actor's bindings in every permission check:

- **Narrowing only:** a key or token holding `attachment:read` reads what its role reads, nothing else.
- **Unknown scope:** fails closed.
- **No mask:** a session is unmasked, and so is a key issued with `scopes: 'all'`. A key always states its scopes, and a rolled key keeps those of the key it replaces, with its expiry.
- **REST refusal:** answers as for an actor without the permission, with no `insufficient_scope` challenge.
- **MCP refusal:** names the scope to step up to.
- **One list:** the same ids appear in the OpenAPI `oauth2` scheme, discovery documents and the consent screen.

### Quotas and limits

Tenant restrictions cap the active service accounts and live API keys a tenant holds. Machine calls pass a per-second burst limit, and some routes also spend an hourly points budget whose size the tenant restrictions set. Each actor has its own limit and budget: an app acting on a person's consent spends that person's budget.

## API

| Standard | Where it applies | How far |
| --- | --- | --- |
| [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) | One document describes every route and generates the SDK and the API docs | In full |
| [aep.dev](https://aep.dev) | Resource names, standard methods, custom methods and page tokens | As far as an offline-first app allows |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) | `ETag`, `If-Match` and `If-None-Match` on a single channel or product | In full |
| [RFC 7396](https://www.rfc-editor.org/rfc/rfc7396) | A `PATCH` is a merge patch | Channels; a product update sends field operations |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) | Every error body | In full |
| [RateLimit header fields](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/), IETF draft | What a rate-limit budget has left | Reads |
| [MCP](https://modelcontextprotocol.io) | One endpoint per organization | In full |

### The REST API

The REST API is the API the app's own frontend uses, and the API docs show every route's shape, status codes and limits.

Four behaviors hold across the API, and a client codes against them:

- **Concurrency.** A single channel or product answers with a strong `ETag`. A write that sends it back in `If-Match` applies only while nothing changed the resource since, else the API answers 412 `precondition_failed`. A write that changes nothing keeps the tag. A `GET` with `If-None-Match` answers 304 while the tag holds. A batch takes no `If-Match`.
- **Paging.** A list answers a page with a `nextPageToken` while more follow, passed back as `pageToken`. A token is opaque and bound to its list; an altered one is refused as `invalid_page_token`.
- **Mirroring.** Range reads with `afterSeq` and `untilSeq` return products in sync order, a chunk at a time, deletions as tombstones. After an absence longer than the activity window, a mirror reads everything again.
- **Updates.** A `PATCH` is a merge patch: a field left out keeps its value and `null` clears it. A client sends the fields it changed, and a product update sends them as field operations.

### The MCP endpoint

Each organization has an MCP endpoint that accepts only access tokens ([MCP](./MCP.md)). A client with no token is told where the metadata lives and to start with the read scopes. A person consents through the OAuth server, and the client comes back. An MCP tool is a route you opted in.

### Changes to the API

A breaking change to a field gives older clients time to move. It ships with a lens ([Schema evolution](./SCHEMA_EVOLUTION.md)): for an expand window the API accepts the old and the new name, and the OpenAPI document shows the current shape. A client that sends its schema version in `X-Client-Version` is accounted for when an old name retires.

## Embedding

Your app plays both LTI roles: it opens other apps as tabs of a channel, and another app or a learning platform opens it inside its pages ([LTI](./LTI.md)).

On the platform side, an LTI tool installed in the tenant is a service account too. It waits for an admin's approval before it acts. Then it acts on its own, within the scopes the admin granted: a tab that is on gives it the least privileged role of the tab's own channel, which a launch names as its context.

On the LTI tool side, each LTI platform the app is connected to has a service account in the app. The import of a course's members writes as it.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [LTI 1.3](https://www.1edtech.org/standards/lti) | Both roles: the platform and the LTI tool | Without the grade and deep linking services |
| [LTI Dynamic Registration](https://www.imsglobal.org/spec/lti-dr/v1p0) | Connecting two apps by one pasted address | In full |
| [NRPS](https://www.imsglobal.org/spec/lti-nrps/v2p0) | The members of a context | Without a resource link's members |

## Realtime and files

Live changes, collaborative editing and uploads travel over standard transports.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html) | The live change stream | In full |
| [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) | The Yjs relay's connection | In full |
| [tus](https://tus.io) | Resumable uploads through Transloadit | In full |

## Messaging

Notifications leave the app through standard push and email.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) and [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292) | Web Push to each device a user turns it on for | In full |
| [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) | One-click unsubscribe in an email with an unsubscribe link | In full |

## Data and operations

Ids and telemetry use formats that other tools already read.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) | UUID v7 entity and change ids, minted where the edit is made, the device included | In full |
| [OpenTelemetry](https://opentelemetry.io/) | Traces, metrics and logs over OTLP | In full |
| [W3C Trace Context](https://www.w3.org/TR/trace-context/) | `traceparent` from the browser to the backend | In full |

## Accessibility and agents

The interface follows an accessibility standard, and the repository gives coding agents their instructions in the file they look for.

| Standard | Where it applies | How far |
| --- | --- | --- |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Level AA: the audit and the accessibility statement | The conformance report is a draft |
| [AGENTS.md](https://agents.md) | Instructions for coding agents in the repository | In full |
