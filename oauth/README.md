# OAuth worker

This document covers the OAuth worker: the app's own **OAuth 2.1 authorization server**, issuing the access tokens the REST API and the MCP endpoint accept.

### TL;DR

The worker runs `node-oidc-provider` on the app origin under `/oauth`. A person consents to a client on a page the app renders, and the token that results acts as that person in one tenant, narrowed to the scopes they approved. A service account can also get a token from its API key. Keys, consents and tokens live in the app database; nothing is issued that a guard could not verify locally.

## How it fits

```text
MCP client / registered app
        │  authorization code + PKCE (person)  or  client_credentials (service account)
        ▼
OAuth worker  (/oauth/*)
  ├─ discovery, authorize, token, revocation, JWKS
  ├─ interaction routes the app renders as /auth/consent
  └─ store: oauth_clients rows, oidc_payloads, signing_keys
        │
        ▼
access token (RS256 JWT, one tenant, one resource)
        │
        ▼
REST API (serviceGuard / actorGuard)   MCP endpoint (tokenGuard)
```

The worker is one more `MODE` of the backend image: a process of its own on `devPorts.oauth`, or folded into the API under `singleVM`. The reverse proxy routes `/oauth/*` to it, so the issuer (`appConfig.oauthUrl`) shares the app origin with the API and the consent page. The provider runs with its own Postgres adapter, no dynamic client registration, no developer interactions, no id tokens: the app is an authorization server, not an identity provider. Concepts and faces: [Interoperability](../cella/INTEROPERABILITY.md).

The code is in `backend/src/modules/oauth-server/`: the provider configuration, the adapter, the keystore, the interaction routes, the grant policy, the token verifier the guards use, and the sweep job. `oauth/src/oauth-worker.ts` is the development entry. Claim names, limits and other details are documented there, at their declarations.

## Clients and consent

| Client | Identified by | Authenticates with | Consent |
| --- | --- | --- | --- |
| MCP client (Claude Desktop, VS Code) | A Client ID Metadata Document: `client_id` is the HTTPS URL of its metadata | Nothing (public client, PKCE) | The person, if the tenant allows consented clients |
| Registered app (a portfolio site, a partner) | A row in `oauth_clients` | Its secret, or nothing when public | The person, if an admin installed the app in the tenant |
| Service account | Its own id | Any of its live API keys as the client secret; the token stays within that key's scopes | None: `client_credentials` |

An authorization request brings the browser to the consent page, an app page under the sign-in framing. Someone who is not signed in goes through sign-in and back. The page shows who asks, the tenant (and on the MCP face the organization) the grant reaches, and the requested scopes, and the person accepts or refuses. A registered app appears with the name and logo a system admin set, a client identified by its metadata document only as the host that serves its `client_id`.

Whether a consent is possible is decided on the server, by the grant policy. The person must be a member of the resource's tenant, and the tenant must allow consented clients or, for a registered app, have it installed. The page shows a refusal and disables Accept, and a posted accept is refused all the same.

A consent is a grant, bound to one resource with the approved scopes. It holds only while the grant policy says so: every code exchange and every refresh asks again, and a refused grant is deleted with every token issued under it. People list and revoke their grants under Connected apps on their account page, and deleting an account deletes all of them.

The provider keeps a session of its own in the browser. It answers a client without the consent page only while that browser's app session belongs to the same person, so the next person on a shared computer never extends someone else's grant. Signing out of the app, ending one's other sessions or turning on MFA ends the person's provider sessions. Grants and refresh tokens stay.

## Tokens

| Setting | Value |
| --- | --- |
| Grant types | `authorization_code` (PKCE required), `refresh_token` (rotated), `client_credentials` (service accounts only) |
| Client auth | `none`, `client_secret_basic` |
| Access token | RS256 JWT, 1 hour |
| Refresh token | 30 days, rotated on use; grants live 30 days |
| Scopes | The app's access scopes (`attachment:read`, …), never `openid` |

Every token names a resource (RFC 8707): `<backendUrl>/t/<tenant>` for the REST API or `<mcpUrl>/<tenant>/<org>/mcp` for one organization's MCP endpoint. A request for any other resource fails with `invalid_target`, so a token never crosses tenants.

A guard verifies a token locally, against the public signing keys: no round trip to this worker and no row per token. A person's token rests on its grant and a service account's on the API key it was minted with, and the guard reads that at every request. Whatever ends a grant or a key, or changes a membership, therefore stops or narrows its tokens at the next request, in every process.

A change to the rest of what the grant policy reads (the user row, an installed app, the tenant's policy) counts at once in the process that made it and within 15 seconds in the others.

## Keystore

`signing_keys` holds RS256 key pairs, with the private key encrypted at rest. Two are live: `current` signs, and `next` is published ahead of use, so verifiers already know it when it takes over. A retired key keeps verifying until its last token expired. Rotation is not routed yet, and the worker loads its keys at boot, so a rotation also restarts it.

## Store and sweep

`oidc_payloads` is the provider's store: grants, sessions, interactions, authorization codes and refresh tokens. A code or a refresh token is stored under the hash of its value, with no copy of the value, so reading the store yields nothing a client could present. Each is spent once: a second spend, sequential or concurrent, is a replay and revokes the grant with every token issued under it. An hourly job on the [jobs worker](../jobs/README.md) deletes expired rows and, after thirty days, spent ones.

## Operational constraints

- **Same origin.** Discovery, the consent page and the interaction cookies assume the issuer sits on the app origin. Both discovery documents are served under `/oauth/.well-known/`, and MCP clients fall back to the `openid-configuration` one. The RFC 8414 path-insertion form at the origin root (`/.well-known/oauth-authorization-server/oauth`) is not routed: a client that needs it needs a proxy rewrite.
- **Reads the app database.** Sessions, memberships, tenants, service accounts and keys are read directly, so the worker needs the runtime database role.
- **Clients are read per request.** A disabled account or a changed redirect URI counts at once.
- **A service account's client secret is any of its live API keys.** Revoking a key also ends its `client_credentials` access, and the tokens minted with it stop at the guard. A registered app's secret is compared by hash.
- **A fetch budget per address.** A client id the worker has not seen may be the URL of a metadata document on a host the requester picks, so those fetches are limited per IP. A request that fetches nothing, such as a refresh, never counts.
