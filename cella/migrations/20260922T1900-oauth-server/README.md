# OAuth authorization server: keystore, consent, connected apps

## What & why

cella issues its own OAuth 2.1 tokens (AUTH_SUBSTRATE_PLAN Phase D). `node-oidc-provider` runs as its own process
(`MODE=oauth`, port `devPorts.oauth`) on the same public origin under `/oauth/*`: Postgres adapter over
`oidc_payloads`, signing keys in `signing_keys` (RS256, private JWK encrypted with `data-encryption.ts`, `current` +
`next` published), grant types `authorization_code` + `refresh_token` + `client_credentials`, client auth `none`
(Client ID Metadata Documents, for MCP clients) and `client_secret_basic` (`clients` rows, and every active service
account with its secret keys as client secrets). Every token names an RFC 8707 resource (`<backendUrl>/t/<tenant>` or
`<mcpUrl>/<tenant>/<org>/mcp`), so it never crosses tenants. Consent is a cella page (`/oauth/consent`) that reads the
session; `GET/DELETE /me/connected-apps` list and revoke grants. `serviceGuard` and `actorGuard` accept the JWT as a
bearer and resolve the consenting user (masked by the token scopes) or the service account behind `client_credentials`.

## Blast radius

Database change (three tables, `service_accounts.client_id`, tenant `restrictions` default gains
`allowConsentedClients`), not sync-breaking, no cache bump. New config keys `oauthUrl`, `services.oauth`,
`devPorts.oauth`, env `OAUTH_URL`, `MODE=oauth`. Infra registry gains the `oauth` service (reuses the backend image,
co-hosted under singleVM, path route `/oauth`), so per-stack `Apply` creates its principal before the next deploy.
Two new `me` routes, one public frontend route, one account-settings tool.

## Run

No script: manual.

```sh
pnpm install
pnpm generate
pnpm sdk
pnpm generate:routes
pnpm infra:compose
```

## Manual steps

1. Config: add `oauthUrl` to every `shared/config/config.<mode>.ts` (same origin as the API: `<origin>/oauth`),
   `services.oauth: { enabled: boolean }` and `devPorts.oauth` to `config.default.ts`; the vite dev proxy forwards
   `/oauth` to that port. Set `services.oauth.enabled: true` where MCP clients or registered apps must connect.
2. RLS: add `clients`, `signing_keys`, `oidc_payloads` to the grant list in `backend/scripts/migrations/10-rls.migration.ts`
   if the app pins that file (auth tables, no tenant policy).
3. Tests: add `oidc_payloads` cleanup where suites truncate auth tables; the AS test starts the provider in-process
   (`createOauthListener`), no separate process.
4. Infra tests that enumerate the registry (`services.test.ts`, `naming.test.ts`, `print-deploy-env.test.ts`,
   `setup-service-apps.test.ts`, `synth.test.ts`) list `oauth` after `mcp`.
5. Locale keys: `connected_apps*`, `oauth_consent*`, `oauth_refusal.*`, `scope.<entity>_<read|write>`, two errors. Apps with
   extra entity scopes add `scope.<entity>_read` / `_write` labels; unknown scopes render raw.
6. Operations that must be callable with a token keep `actorGuard`; a user token sets `user` and `memberships` like
   a session would, so `UserContext` operations also work behind `serviceGuard`.

## Verify

```sh
pnpm check
pnpm --filter backend exec vitest run tests/oauth-server.test.ts
pnpm --filter infra test
curl -s http://localhost:3000/oauth/.well-known/oauth-authorization-server | jq .issuer
```
