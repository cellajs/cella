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

The worker is a `MODE` of the backend image ([Deployment](../cella/DEPLOYMENT.md#overview)), and the reverse proxy routes `/mcp/*` to it. It mounts the module routes for tool calls but serves only the MCP routes. Concepts and faces: [Interoperability](../cella/INTEROPERABILITY.md); tokens: [OAuth worker](../oauth/README.md).

The backend counterpart in `backend/src/modules/mcp/` holds the JSON-RPC server, the routes and the tools (`mcp-tools.ts`); `mcp/src/mcp-worker.ts` is the development entry. Error codes, limits and schema details are documented there, at their declarations.

## Discovery and tokens

| Request | Response |
| --- | --- |
| The protected-resource metadata (`…/mcp/.well-known/oauth-protected-resource`) | The resource identifier, the authorization server and the scopes it supports (RFC 9728) |
| A call without a token | 401 with a challenge that says where the metadata lives |
| A token for another tenant or another organization's endpoint | 401: the audience must be this endpoint or the tenant's REST API |
| `tools/call` outside the token's scopes | 403 with a challenge and a JSON-RPC error, both naming the scope to step up to |

A client follows the challenge to the OAuth worker, obtains consent and a token bound to this organization's resource, and retries; a 403 step-up works the same way. Sessions and API keys are refused here on purpose: the MCP face takes only tokens, so every call traces to a consent or to a service account's `client_credentials` grant.

## MCP tools are routes

A route opts in by carrying `xTool` in its `xRoute` config:

```ts
xTool: {
  description: 'Rename an attachment or replace its description.',
  approvalRequired: true,
  entity: 'attachment',
},
```

Its guards must accept an access token (`actorGuard` or `serviceGuard`), since a tool call carries nothing else: a tool route behind a cookie-only guard is refused when its module loads.

The OpenAPI spec shows it under `x-tool`, and the rest of a tool is derived from the route:

| Tool field | Source |
| --- | --- |
| `name` | The route's `operationId`: its key in `createXRoutes` unless set |
| `inputSchema` | The route's request: path params minus the tenant and organization the endpoint already resolved, the query, and the body |
| Scope, also in `_meta.scope` | `entity` with the method: `GET` needs `<entity>:read`, anything else `<entity>:write` |
| `annotations` | Read-only, destructive and idempotent hints from the method |

`tools/list` returns every tool, not only the ones the token may call, so a client can discover what to step up to. `tools/call` validates the arguments against the route's own schemas and runs the route with the caller's token; its JSON answer is the result. A permission or domain error from the route comes back as a tool result, which a model can act on; only transport-level faults are JSON-RPC errors.

The template registers the five attachment routes (list, get, create, update, delete). An app adds `xTool` to any organization route that answers JSON. "Every operation is a tool" is not the default on purpose.

## Transport

JSON-RPC 2.0 over Streamable HTTP with JSON responses. Batches are accepted. Results carry both a `text` content block and `structuredContent`. There is no server-initiated stream, no sessions, no resources or prompts yet.

## Operational constraints

- **Needs the OAuth worker.** Without `services.oauth` no token can exist, so every call is a 401.
- **Limits.** A tool call spends the route's limits as a REST request with the same token does, plus the endpoint's own limit per account. A server error reaches the model without its message.
- **The AI key is unrelated.** `SCW_AI_API_KEY` switches on the app's own AI features (job queues); the MCP endpoint never needs it.
- **Tool descriptions are model-facing English.** They are not translated.
