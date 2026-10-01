# MCP worker

This document covers the MCP worker: the app's **Model Context Protocol endpoint**, one per organization, exposing routes that opted in as MCP tools to AI clients.

### TL;DR

An AI client connects to `<mcpUrl>/<tenant>/<org>/mcp` with an access token from the OAuth worker and nothing else. MCP tools are ordinary routes that carry `xTool`; their input comes from the route's request schema and a call runs the route itself, as the person who consented or the service account behind the token. A call outside the token's scopes answers with the scope to step up to.

## How it fits

```text
AI client (Claude Desktop, VS Code, a CI job)
        │  JSON-RPC over HTTP, Bearer access token
        ▼
MCP endpoint  /<tenant>/<org>/mcp
  ├─ tokenGuard → tenantGuard → orgGuard
  ├─ tools/list: every route that carries xTool
  └─ tools/call: scope check, input validation, the route in-process
        │
        ▼
the route: its guards, limiters, cache and handler, as for a REST request
```

The worker is a `MODE` of the backend image: its own process on `devPorts.mcp`, or folded into the API under `singleVM`; the reverse proxy routes `/mcp/*` to it. It serves only the MCP routes; a tool call runs through the module routes mounted in the same process, which it never serves. Concepts and faces: [Interoperability](../cella/INTEROPERABILITY.md); tokens: [OAuth worker](../oauth/README.md).

## Discovery and tokens

| Request | Response |
| --- | --- |
| `GET …/mcp/.well-known/oauth-protected-resource` | RFC 9728 metadata: the resource identifier, the authorization server, `scopes_supported` |
| `POST …/mcp` without a token | 401, `WWW-Authenticate: Bearer resource_metadata="…"`: where to read the metadata |
| `POST …/mcp` with a token for another tenant, or an MCP token for another organization | 401 `invalid_token`: the audience does not match |
| `tools/call` outside the token's scopes | 403, `WWW-Authenticate: Bearer error="insufficient_scope", scope="attachment:write", resource_metadata="…"`, plus a JSON-RPC error (`-32002`) carrying the scope |

A client follows the challenge to the OAuth worker, obtains consent and a token bound to this organization's resource, and retries. The step-up on 403 works the same way with a wider scope. Sessions and API keys are refused here on purpose: the MCP face takes only tokens, so every call traces to a consent or to a service account's `client_credentials` grant.

## MCP tools are routes

A route opts in by carrying `xTool` in its `xRoute` config, after its `xGuard`, `xRateLimiter` and `xCache`:

```ts
xTool: {
  description: 'Rename an attachment or replace its description.',
  approvalRequired: true,
  entity: 'attachment',
},
```

The OpenAPI spec shows it under `x-tool`; the MCP endpoint builds its tools from the mounted routes that carry it. Everything else is derived:

| Tool field | Source |
| --- | --- |
| `name` | The route's `operationId`: its key in `createXRoutes` unless set |
| `inputSchema` | The route's request: path params minus the tenant and organization the endpoint already resolved, the query, and the body. A body's sync transaction (`stx`) is left out of what the model sees and rebuilt server-side before the route's own schema validates the call. An array body nests under `items`. |
| Scope | `entity` with the method: `GET` needs `<entity>:read`, anything else `<entity>:write` |
| `annotations` | `readOnlyHint`, `destructiveHint`, `idempotentHint` from the method |
| `_meta.scope` | The scope, so a client can ask for it up front |

`tools/list` returns every tool, not only the ones the token may call, so a client can discover what to step up to. `tools/call` validates the arguments against the route's own schemas (a refusal is a JSON-RPC `-32602` with the issues), then sends the request through the app with the caller's token: the route's guards, limiters, cache and handler run as for a REST request, and its JSON answer is the result. A permission or domain error from the route comes back as a tool result with `isError`, which a model can act on; only transport-level faults are JSON-RPC errors. The template registers the five attachment routes (list, get, create, update, delete); an app adds `xTool` to any organization route that answers JSON. "Every operation is a tool" is not the default on purpose.

## Transport

JSON-RPC 2.0 over Streamable HTTP with JSON responses: `initialize` (echoes the client's protocol version, default `2026-07-28`), `ping`, `tools/list`, `tools/call`, and the `notifications/*` messages, which get no reply. Batches are accepted. Results carry both a `text` content block and `structuredContent`. There is no server-initiated stream, no sessions, no resources or prompts yet.

## Operational constraints

- **Needs the OAuth worker.** Without `services.oauth` no token can exist, so every call is a 401.
- **One organization per endpoint.** The path binds the tenant and organization; the token's audience must be this organization's MCP resource or the tenant's REST API resource, never another tenant.
- **In-process requests.** The endpoint counts its own requests against `mcpRequestLimiter` (30 per second per account). A tool call then passes the route's own guards, limiters and cache, and counts once against the per-account burst limit there, as a REST request with the same token does. A server error reaches the model as `server_error` without its message.
- **The AI key is unrelated.** `SCW_AI_API_KEY` switches on the app's own AI features (job queues); the MCP endpoint never needs it.
- **Tool descriptions are model-facing English.** They are not translated.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` | 204 (the shared app's health route) |
| `POST /<tenant>/<org>/mcp` | The endpoint |
| `GET /<tenant>/<org>/mcp/.well-known/oauth-protected-resource` | Public metadata |

Configuration and environment (the backend's `.env` and `appConfig`):

| Key | Purpose |
| --- | --- |
| `services.mcp.enabled` | Runs the worker and the routes; `false` answers 404 |
| `mcpUrl`, `MCP_URL` | The public base, same origin as the API under `/mcp` |
| `devPorts.mcp`, `PORT` | `MODE=mcp` selects this entry; the dev entry, the infra env and the `singleVM` fold set `PORT` to `devPorts.mcp` (4003), and a bare `PORT` defaults to the API port |
| `DATABASE_URL`, `DATABASE_SSL_CA` | The runtime database role |
| `SCW_AI_API_KEY` | Optional; the app's own AI features only |

The backend counterpart in `backend/src/modules/mcp/` holds the JSON-RPC server, the routes and the tools (`mcp-tools.ts`: built from the mounted routes, called through the app); `mcp/src/mcp-worker.ts` is the development entry.
