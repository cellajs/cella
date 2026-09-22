# MCP on the substrate: tokens only, tools from routes

## What & why

The MCP endpoint (`POST /<tenant>/<org>/mcp`) now sits behind `tokenGuard`: only access tokens from the
authorization server, never sessions or API keys (MCP spec 2026-07-28, AUTH_SUBSTRATE_PLAN Phase E). A tokenless call
answers `401` with `WWW-Authenticate: Bearer resource_metadata="…/mcp/.well-known/oauth-protected-resource"`; that
public route publishes the RFC 9728 document (resource id, `authorization_servers`, `scopes_supported`). Tools are no
longer a hand-written registry: a route opts in with `'x-tool': { enabled, description, approvalRequired, category,
entity, execute }` on `createXRoute`, which registers it (`backend/src/core/mcp-tool-registry.ts`). The input schema
derives from the route's `request` (params minus `tenantId` / `organizationId`, query, body); a body's sync
transaction (`stx`) is left out of what the model sees and rebuilt server-side before the route's own schema
validates the call. `execute(ctx, { params, query, body })` is the handler's one line, typed from the route. `tools/list` returns every tool with `annotations` and the
scope it needs (`_meta.scope`); `tools/call` outside the token's scopes answers `403` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="<entity>:write"` (step-up), inside them it runs the
operation in-process as the consenting user or the service account. The attachment module ships the showcase
(list, get with `descriptionText`, create, update, delete). OpenAPI gains an `oauth2` security scheme whose scopes are
the derived vocabulary; guards emit it per operation.

## Blast radius

No database change. Route change: `handleMcp` refuses sessions (was `userGuard`). Config: `services.mcp` enabled in
development and test. `@tanstack/ai` dropped from the backend. `buildTools` and `ExecutableTool` are gone; apps that registered tools
there move them onto the routes.

## Run

No script: manual.

```sh
pnpm install
pnpm sdk
```

## Manual steps

1. Config: `services: { mcp: { enabled: true } }` in `config.development.ts` and `config.test.ts` (and wherever MCP
   clients must connect); `oauth` must be enabled on the same modes.
2. Tools: for each route an MCP client may call, add `'x-tool': { enabled, description, approvalRequired, category,
   entity, execute }` to the route; `execute: (ctx, { params, query, body }) => xOp(ctx, ...)` mirrors the handler.
   Query values arrive as strings (the route's own schema reads them); a `stx` in the body is rebuilt server-side, so
   pass `{ serverOrigin: true }` to update operations. Scope derives from the method (`get` = `<entity>:read`, else
   `<entity>:write`).
3. Apps that extended `buildTools()` (removed) move each tool onto its route; `@tanstack/ai` types are no longer
   imported by the template.
4. Tests: `backend/tests/oauth-helpers.ts` starts the AS in-process and runs client_credentials or the authorization
   code flow with consent through the interaction routes; reuse it for app tool tests.
5. Provenance written by a service account hydrates to `null` in `createdBy` / `updatedBy` on the wire (audit-user
   join is user-only); rows carry the principal id. A service badge in the UI is a follow-up.

## Verify

```sh
pnpm check
pnpm --filter backend exec vitest run tests/mcp.test.ts src/modules/mcp/mcp-server.test.ts
curl -s http://localhost:3000/mcp/<tenant>/<org>/mcp/.well-known/oauth-protected-resource | jq
curl -si -X POST http://localhost:3000/mcp/<tenant>/<org>/mcp -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | grep -i www-authenticate
```
