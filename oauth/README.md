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

## Clients and consent

| Client | Identified by | Authenticates with | Consent |
| --- | --- | --- | --- |
| MCP client (Claude Desktop, VS Code) | A Client ID Metadata Document: `client_id` is the HTTPS URL of its metadata | Nothing (public client, PKCE) | The person, if the tenant allows consented clients |
| Registered app (a portfolio site, a partner) | A row in `oauth_clients` | Its secret, or nothing when public | The person, if an admin installed the app in the tenant |
| Service account | Its own id | Any of its live API keys as the client secret | None: `client_credentials` |

An authorization request lands the browser on `/auth/consent?uid=…`, an app page under the sign-in framing. The page reads the interaction through the worker's JSON routes with the session cookie (a missing session goes through sign-in and back), shows the client's name and logo and the requested scopes as labels, and posts accept or refuse. Three refusals are decided server-side and shown instead of the button: the person is not a member of the resource's tenant, the tenant does not allow consented clients (`restrictions.allowConsentedClients`), or the registered app is not installed there (`service_accounts.oauthClientId`).

A consent is a Grant row bound to one resource with the approved scopes. People list and revoke theirs at `GET` / `DELETE /me/connected-apps`; revoking deletes the grant and every token issued under it.

## Tokens

| Setting | Value |
| --- | --- |
| Grant types | `authorization_code` (PKCE required), `refresh_token` (rotated), `client_credentials` |
| Client auth | `none`, `client_secret_basic` |
| Access token | RS256 JWT, 1 hour |
| Refresh token | 30 days, rotated on use; grants live 30 days |
| Scopes | The app's access scopes (`attachment:read`, …), never `openid` |

Every token names a resource (RFC 8707): `<backendUrl>/t/<tenant>` for the REST API or `<mcpUrl>/<tenant>/<org>/mcp` for one organization's MCP endpoint. A request for any other resource fails with `invalid_target`, so a token never crosses tenants. The claims a guard reads are `sub` (the principal), `principal_kind` (`user` or `service`), `tenant_id`, `scope`, `aud` and `iss`. Verification happens in the guard against the published keys, cached for five minutes: no round trip to this worker, no row per token.

## Keystore

`signing_keys` holds RS256 key pairs with the private JWK encrypted at rest under `DATA_ENCRYPTION_KEY`. Two rows are live: `current` signs, `next` is published ahead of use so verifiers already know it when it takes over. A partial unique index keeps one of each, so two processes booting at once mint one set. Rotation (`next` → `current` → `retired`) is not routed yet; the worker loads its keys at boot, so a rotation also restarts it.

## Store and sweep

`oidc_payloads` is the provider's store, one row per model instance keyed by `(type, id)`: grants, sessions, interactions, authorization codes, refresh tokens, replay detection. The consenting user's id is lifted into an indexed column so the account page and a revoke are index reads. An hourly job on the API deletes expired rows and consumed rows older than thirty days.

## Operational constraints

- **Same origin.** Discovery, the consent page cookie and the interaction cookies assume the issuer sits on the app origin. Both discovery documents are served under `/oauth/.well-known/` (the path-appending form MCP clients try last); the RFC 8414 form at the origin root is a proxy rewrite when a client needs it.
- **Reads the app database.** Sessions, memberships, tenants, service accounts and keys are read directly; the worker starts after the API in development for migrations and needs the runtime database role in production.
- **One process serves consent.** The interaction routes render nothing themselves; the page under `/auth/consent` is the frontend's.
- **Client secrets are hashes.** A registered app's secret is compared by hash; a service account's client secret is any of its live keys, so revoking a key also ends its `client_credentials` access.
- **Metadata caches for a minute.** Adapter-loaded clients are cached; disabling a service account invalidates its entry.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` (also `/oauth/health`) | 204 |
| `GET /health?depth=full` | JSON with `db` and `signingKey` components; 503 when either fails |
| `GET /oauth/.well-known/oauth-authorization-server` | RFC 8414 metadata (also `openid-configuration`) |
| `GET /oauth/jwks` | Public keys, `current` and `next` |

Configuration and environment (the backend's `.env` and `appConfig`):

| Key | Purpose |
| --- | --- |
| `services.oauth.enabled` | Runs the worker; `false` also hides the Connected apps card |
| `oauthUrl`, `OAUTH_URL` | The issuer, same origin as the API under `/oauth` |
| `devPorts.oauth`, `PORT` | Listen port, default 4004; `MODE=oauth` selects this entry |
| `COOKIE_SECRET` | Signs the provider's interaction and session cookies |
| `DATA_ENCRYPTION_KEY` | Encrypts private signing keys at rest |
| `DATABASE_URL`, `DATABASE_SSL_CA` | The runtime database role |

The backend counterpart in `backend/src/modules/oauth-server/` holds the provider configuration, the adapter, the keystore, the interaction routes, the token verifier the guards use, and the sweep job; `oauth/src/oauth-worker.ts` is the development entry.
