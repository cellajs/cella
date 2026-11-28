# OAuth

This document covers the OAuth service: the app's own [OAuth 2.1](https://oauth.net/2.1/) authorization server, issuing the access tokens the REST API and MCP accept.

### TL;DR

A person consents to a client on an app page, and the client's token acts as that person in one tenant, within the approved scopes. A service account can get a token from its API key, and an installed LTI tool from the key it registered. The OAuth service runs `node-oidc-provider` on the app origin under `/oauth`. Keys, consents and tokens live in the app database, and a guard verifies every token locally.

## How it fits

```text
MCP client / registered app
        │  authorization code + PKCE (person)  or  client_credentials (service account, installed LTI tool)
        ▼
OAuth service  (/oauth/*)
  ├─ discovery, authorize, pushed authorization requests, token, revocation, JWKS
  ├─ interaction routes the app renders as /auth/consent
  ├─ LTI platform routes (has.ltiPlatform): configuration, LTI tool registration, launch
  └─ store: oauth_clients rows, oidc_payloads, signing_keys
        │
        ▼
access token (RS256 JWT, one tenant, one resource)
        │
        ▼
REST API (serviceGuard / actorGuard)   MCP endpoint (tokenGuard)
```

The issuer shares the app origin with the API and the consent page: the reverse proxy routes `/oauth/*` to it. The OAuth service issues no ID tokens to OAuth clients: the app is an authorization server, not an identity provider. `pnpm dev` starts it beside the API.

## Clients and consent

MCP clients and registered apps act for the person who consented. A service account and an installed LTI tool act without a person, as themselves.

| Client | Identified by | Authenticates with | Who consents |
| --- | --- | --- | --- |
| MCP client (Claude Desktop, VS Code) | A Client ID Metadata Document: `client_id` is the HTTPS URL of its metadata | Nothing (public client, PKCE) | The person, if the tenant allows unregistered clients, which only development mode or a system admin turns on |
| Registered app (a portfolio site, a partner) | A row in `oauth_clients` | Its secret, or nothing when public | The person, if the app is installed in the tenant |
| Service account | Its own id | Any of its live API keys as the client secret, which caps the token at that key's scopes | None: `client_credentials` |
| Installed LTI tool | Its registration's `client_id` | An assertion signed with a key of the set it registered (`private_key_jwt`) | The admin's approval: `client_credentials`, within the granted scopes |

A client that registers only through dynamic client registration (RFC 7591) cannot connect. It needs a Client ID Metadata Document or a registered app.

An authorization request brings the browser to the consent page, through sign-in when needed. The page shows who asks, the tenant the grant reaches and the requested scopes. For an MCP endpoint it also names the organization.

A registered app shows its registered name and logo. A client known by its metadata document shows only the host that serves it. Beside either, the page names the host of the redirect URI, which a client's name does not vouch for.

The grant policy on the server decides whether a consent is possible. The person must also be a member of the resource's tenant. The page shows a refusal and disables Accept. A posted accept is refused all the same.

A consent is a grant, bound to one resource with the approved scopes. It holds only while the grant policy says so. Every code exchange and every refresh asks again.

A refused grant is deleted with every token issued under it. People list and revoke their grants under Connected apps on their account page. Deleting an account deletes all of them.

The provider keeps a session of its own in the browser. It skips the consent page only while that browser's app session belongs to the same person. The next person on a shared computer never extends someone else's grant.

Signing out of the app, ending one's other sessions or turning on MFA ends the person's provider sessions. Grants and refresh tokens stay.

### Installed LTI tools

An LTI tool registers at the service's own LTI routes, with a one-use token an organization admin started ([LTI](./LTI.md)). Its row in `oauth_clients` is private to that tenant. Once an admin approves it, it is a client of the provider at the token endpoint alone: no authorization request or consent names it.

Its token acts as the installation in its own tenant's API and carries only scopes the admin granted. The LTI tool asks for them by the LTI service scopes that stand for them, such as the NRPS scope for `user:read`: the token carries the access scope, and the answer names the service scope. The service reads the LTI tool's key set itself, through the guarded fetch every address a tenant supplies goes through, and hands the keys to the provider.

An LTI tool's assertion meets four rules:

- **Once:** an assertion counts once.
- **Lifetime:** it must expire within five minutes.
- **Audience:** one, a string or a list of one: the issuer, which the LTI configuration gives as the authorization server, or the token endpoint's address as the configuration publishes it.
- **Host:** an address built from another host a request names is refused. The provider takes the token endpoint's address only at the host it sees: behind a proxy, the public host.

A launch of that LTI tool reaches the service's own launch endpoint, not the provider's authorization endpoint. No session cookie is read there: a one-use launch record the API made names the person, and the service signs the launch's ID token, the only one it issues, with the provider's current key.

## Tokens

A token never crosses tenants. Every token names a resource (RFC 8707): `<backendUrl>/tenants/<tenant>` for the REST API, or `<mcpUrl>/tenants/<tenant>/organizations/<org>/mcp` for one organization's MCP endpoint and that organization's REST routes. A request for any other resource fails with `invalid_target`, as does an authorization request that names none. An installed LTI tool names none, as LTI tools do.

| Part | What a client gets |
| --- | --- |
| Grant types | `authorization_code` (PKCE required), `refresh_token` (rotated), `client_credentials` (service accounts and installed LTI tools only) |
| Access token | RS256 JWT bearer token, bound to no client key, 1 hour |
| Refresh token | 30 days, rotated on use. Grants live 30 days. |
| Scopes | The app's access scopes (`attachment:read`, …), never `openid` |

The guard reads, at every request, what a token rests on:

- **A person's token:** its grant.
- **A service account's token:** the API key it was minted with.
- **An installed LTI tool's token:** its installation, approved, active and still granted every scope the token carries.

Anything that ends a grant or a key, disables an installation or takes a scope from it stops its tokens at the next request, in every process. A membership change counts just as fast.

A change to anything else the grant policy reads, such as the user row, counts at once in the process that made it. Other processes see it within seconds.

## Keystore

`signing_keys` holds the RS256 key pairs that sign the service's tokens, with the private key encrypted at rest. Three keys are live:

- `current`: signs.
- `next`: published ahead of use.
- `previous`: still published for the tokens it signed before the last rotation.

The keys rotate on a schedule while the OAuth service runs, with no restart. You revoke every token a leaked key signed by deleting its row. The OAuth service replaces it at its next key check, or at once after a restart.

## Store and sweep

`oidc_payloads` keeps the provider's state between requests: grants, codes and refresh tokens.

A code or a refresh token is stored only as the hash of its value. Each is spent once. A second spend is a replay and revokes the grant with every token issued under it.

## Operational constraints

- **Same origin.** Keep the issuer on the app origin: discovery, the consent page and interaction cookies assume it.
- **Discovery.** Both documents live under `/oauth/.well-known/`. The RFC 8414 root location answers too.
- **OpenID discovery.** Published for MCP clients that discover through it, though the server refuses `openid`.
- **Reads the app database.** Give it the runtime role: it reads sessions and memberships directly.
- **Clients are read per request.** A disabled account or a changed redirect URI counts at once.
- **Fetch budget.** Metadata fetches are limited per IP.
