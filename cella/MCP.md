# MCP worker

This document covers the MCP worker: the app's **Model Context Protocol endpoint**, one per organization, exposing routes that opted in as MCP tools to AI clients. It assumes you know the Model Context Protocol: a client, its tools and the JSON-RPC calls that list and run them ([modelcontextprotocol.io](https://modelcontextprotocol.io)).

### TL;DR

An AI client connects to `<mcpUrl>/tenants/<tenant>/organizations/<org>/mcp` with an access token from the OAuth
worker and nothing else. MCP tools are ordinary routes that carry `xTool`, run as the person or service account behind
the token. A call outside the token's scopes answers with the scope to step up to.

## How it fits

```text
AI client (Claude Desktop, VS Code, a CI job)
        │  JSON-RPC over HTTP, Bearer access token
        ▼
MCP endpoint  /tenants/<tenant>/organizations/<org>/mcp
  ├─ tokenGuard → tenantGuard → orgGuard
  ├─ tools/list: every route that carries xTool
  └─ tools/call: scope check, input validation, the route in-process
        │
        ▼
the route: its guards, limiters, cache and handler, as for a REST request
```

The worker is a `SERVICE` of the backend image. The reverse proxy routes `/mcp/*` to it. It mounts the module routes for tool calls, but serves only the MCP routes.

`pnpm dev` starts the worker beside the API. Error codes, limits and schema details are documented there, at their declarations.

## Discovery and tokens

| Request | Response |
| --- | --- |
| The protected-resource metadata (`…/mcp/.well-known/oauth-protected-resource`, or the RFC 9728 location under the origin root) | The resource identifier, the authorization server and the read scopes a client starts with (RFC 9728) |
| A call without a token | 401 with a challenge that says where the metadata lives |
| An invalid token, or an API key | 401 with the same challenge, naming `invalid_token` and why |
| A token for another tenant or another organization's endpoint | 401: the audience must be this endpoint or the tenant's REST API |
| `tools/call` outside the token's scopes | 403 with a challenge and a JSON-RPC error, both naming the scope to step up to |

A client follows the challenge to the OAuth worker and retries with a token bound to this organization's resource. A 403 step-up works the same way. Its challenge names only the scope the call lacks, never the scopes the token holds. A client asks for both when it consents again.

Sessions and API keys are refused here on purpose. The MCP face takes only tokens, so every call traces to a consent or to a service account's `client_credentials` grant.

## MCP tools are routes

A route opts in by carrying `xTool` in its `xRoute` config:

```ts
xTool: {
  description: 'Rename an attachment or replace its description.',
  approvalRequired: true,
  entity: 'attachment',
},
```

Its guards must accept an access token, since a tool call carries nothing else. A tool route behind a cookie-only guard is refused when its module loads.

The OpenAPI spec shows it under `x-tool`. The rest of a tool is derived from the route:

| Tool field | Source |
| --- | --- |
| `name` | The route's `operationId`: its key in `createXRoutes` unless set |
| `inputSchema` | The route's request: path params minus the tenant and organization the endpoint already resolved, the query, and the body |
| Scope, also in `_meta.scope` | `entity` with the method: `GET` needs `<entity>:read`, anything else `<entity>:write` |
| `annotations` | Read-only, destructive and idempotent hints from the method |

- **Every tool listed.** `tools/list` includes tools the token may not call, so a client sees what to step up to.
- **Route schemas.** `tools/call` validates the arguments against the route's own schemas, then runs the route.
- **JSON result.** The route's JSON answer is the tool result.
- **Errors as results.** A permission or domain error from the route is a tool result a model can act on.
- **Invalid params.** Refused arguments or an unknown MCP tool answer a JSON-RPC invalid-params error.

The template registers the five attachment routes as MCP tools. An app adds `xTool` to any organization route that answers JSON. Not every operation is a tool, on purpose.

## Transport

JSON-RPC 2.0 over Streamable HTTP, with JSON responses:

- **Revisions.** Only those that open with `initialize`, never the stateless one.
- **Version header.** A request that names a revision the server does not implement is refused.
- **POST only.** A GET or DELETE is not allowed.
- **Same origin.** A request from a browser page on another origin is refused.
- **Batches.** Accepted.
- **Results.** Both a `text` content block and `structuredContent`.
- **Not yet.** No server-initiated stream, no sessions, no resources or prompts.

## Operational constraints

- **Needs the OAuth worker.** Without `services.oauth` every call is a 401, since no token can exist.
- **Limits.** A tool call spends the route's limits, plus the endpoint's own limit per account.
- **No internals.** A server error reaches the model without its message.
- **Tool descriptions are model-facing English.** They are not translated.
