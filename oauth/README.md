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
| Service account | Its own id | Any of its live API keys as the client secret; the token stays within that key's scopes | None: `client_credentials` |

An authorization request lands the browser on `/auth/consent?uid=…`, an app page under the sign-in framing. The page reads the interaction through the worker's JSON routes with the session cookie (a missing session goes through sign-in and back), shows the client's name and logo and the requested scopes as labels, and posts accept or refuse. Three refusals are decided server-side, by the grant policy (`grant-policy.ts`); the page shows the reason and disables Accept, and a posted accept is refused all the same: the person is not a member of the resource's tenant, the tenant does not allow consented clients (`restrictions.allowUnregisteredClients`), or the registered app is not installed there (`service_accounts.oauthClientId`).

A consent is a Grant row bound to one resource with the approved scopes. It holds only while the grant policy says so: every code exchange and refresh asks again, reading the `users` row (actors outlive users), and a refused grant is deleted with every token issued under it. People list and revoke theirs at `GET /me/connected-apps` and `DELETE /me/connected-apps/{id}`; revoking deletes the grant and every token issued under it. Deleting an account, by its owner or a system admin, deletes all of them.

## Tokens

| Setting | Value |
| --- | --- |
| Grant types | `authorization_code` (PKCE required), `refresh_token` (rotated), `client_credentials` (service accounts only) |
| Client auth | `none`, `client_secret_basic` |
| Access token | RS256 JWT, 1 hour |
| Refresh token | 30 days, rotated on use; grants live 30 days |
| Scopes | The app's access scopes (`attachment:read`, …), never `openid` |

Every token names a resource (RFC 8707): `<backendUrl>/t/<tenant>` for the REST API or `<mcpUrl>/<tenant>/<org>/mcp` for one organization's MCP endpoint. A request for any other resource fails with `invalid_target`, so a token never crosses tenants. The claims a guard reads are `sub` (the actor), `actor_kind` (`user` or `service`), `tenant_id`, `scope`, `aud`, `iss`, and what the token rests on: `gid` (the grant) for a person's token, `key_id` (the API key) for a service account's. Verification happens in the guard against the public keys in `signing_keys` (every status, so a retired key still verifies), cached in-process for five minutes: no round trip to this worker, no row per token. The guard then puts the grant or key to the grant policy and caches the answer for 30 seconds per grant or key; a change made in the same process (a revoked key or connected app, a membership change, a deleted account) drops it at once. A token without `gid` or `key_id` is refused.

## Keystore

`signing_keys` holds RS256 key pairs with the private JWK encrypted at rest under `DATA_ENCRYPTION_KEY`. Two rows are live: `current` signs, `next` is published ahead of use so verifiers already know it when it takes over. A partial unique index keeps one of each, so two processes booting at once mint one set. Rotation (`next` → `current` → `retired`) is not routed yet; the worker loads its keys at boot, so a rotation also restarts it.

## Store and sweep

`oidc_payloads` is the provider's store, one row per model instance keyed by `(type, id)`: grants, sessions, interactions, authorization codes, refresh tokens, replay detection. Codes and refresh tokens are keyed by the SHA-256 of their value and keep no copy of it. Each is spent once by a conditional update: a second spend, sequential or concurrent, is a replay and revokes the grant with every token issued under it. The consenting user's id is lifted into an indexed column so the account page and a revoke are index reads. An hourly job registered with the API deletes expired rows and consumed rows older than thirty days. Like every backend job it runs on one API instance at a time: each instance with `RUN_JOBS` (development by default, and the primary rollout service in a deploy) contends for a Postgres advisory lock, and the holder runs the jobs.

## Operational constraints

- **Same origin.** Discovery, the consent page cookie and the interaction cookies assume the issuer sits on the app origin. Both discovery documents are served under `/oauth/.well-known/`; MCP clients reach the `openid-configuration` one as their last fallback. The RFC 8414 path-insertion form at the origin root (`/.well-known/oauth-authorization-server/oauth`) is not routed; a client that needs it would need a proxy rewrite.
- **Reads the app database.** Sessions, memberships, tenants, service accounts and keys are read directly; the worker starts after the API in development for migrations and needs the runtime database role in production.
- **One process serves consent.** The interaction routes render nothing themselves; the page under `/auth/consent` is the frontend's.
- **Client secrets are hashes.** A registered app's secret is compared by hash; a service account's client secret is any of its live keys, so revoking a key also ends its `client_credentials` access, and the tokens minted with it stop at the guard.
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
| `devPorts.oauth`, `PORT` | `MODE=oauth` selects this entry; the dev entry, the infra env and the `singleVM` fold set `PORT` to `devPorts.oauth` (4004), and a bare `PORT` defaults to the API port |
| `COOKIE_SECRET` | Signs the provider's interaction and session cookies, like the app's own; a comma-separated list rotates (the first signs, any verifies) |
| `DATA_ENCRYPTION_KEY` | Encrypts private signing keys at rest |
| `DATABASE_URL`, `DATABASE_SSL_CA` | The runtime database role |

The backend counterpart in `backend/src/modules/oauth-server/` holds the provider configuration, the adapter, the keystore, the interaction routes, the token verifier the guards use, and the sweep job; `oauth/src/oauth-worker.ts` is the development entry.
