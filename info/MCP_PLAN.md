# MCP — continuation plan

> **Status:** Concept / roadmap. Not a committed milestone set. This document plans how to evolve
> the Model Context Protocol (MCP) support that already exists in Cella core, so that it serves both
> **Cella** (MCP for external use + general AI functionality, no chat agent) and **Raak** (MCP for
> external use + a chat `agent` product + optional standalone AI functionality).
>
> Companion code: `backend/src/modules/ai/` (the chat-free AI capability layer) and
> `backend/src/modules/ai/mcp/` (the MCP server). Companion doc: route extension metadata in
> [../backend/src/core/extensions.ts](../backend/src/core/extensions.ts) (`x-tool`).

## Goal

Make MCP a first-class, fork-agnostic capability of Cella so that:

- **Cella core** ships a working external MCP server that exposes a (by-default empty) tool registry,
  with no dependency on chat/message or any agent product. Forks add tools and get MCP "for free."
- **Raak** reuses the exact same MCP layer, registers its own domain tools (tasks, projects,
  attachments…), and *separately* runs its chat `agent` product. The chat agent and MCP share **one**
  tool registry, so a capability is declared once and exposed to both the in-app model and external
  MCP clients.

The guiding principle is **one tool registry, two surfaces**:

```
                         buildTools(ctx)          ◀── single source of truth
                        (server tool registry, in Cella core `modules/ai`)
                          /              \
                         ▼                ▼
              fork model runner        MCP server
            (e.g. Raak `agent`)     (external clients)
```

Cella core owns the **registry** and the **MCP server**. It deliberately ships **no** LLM transport
and **no** model runner — those belong to whatever consumes the registry (a fork's `agent`, or a
fork's standalone AI feature). MCP itself never calls a model: it exposes tools to *external* model
clients that bring their own model.

## Where we are today

Already implemented (the `ai`/`agent` split):

- **AI capability layer** in Cella core `modules/ai` is **MCP + the tool-registry contract only** —
  no LLM transport, no model runner, no agent:
  - `tool-registry.ts` — `buildTools(ctx): ServerTool[]`, returns `[]` in core; forks override. This
    is the single source of truth the MCP server reads and a fork's model runner reuses.
  - `mcp/mcp-server.ts` — minimal JSON-RPC 2.0 handler (`initialize`, `tools/list`, `tools/call`,
    `ping`, notifications). Zero extra dependencies. Never calls a model.
  - `mcp/tool-source.ts` — adapts `buildTools(ctx)` into MCP tool descriptors (JSON Schema via
    `convertSchemaToJsonSchema`).
  - `mcp/mcp-routes.ts` / `mcp/mcp-handlers.ts` — Hono route at `/:tenantId/:organizationId/mcp`,
    guarded by `authGuard + tenantGuard + orgGuard`, gated by `appConfig.has.ai`.
  - `mcp/mcp-server.test.ts` — 8 no-DB unit tests.
- **Model runner + LLM transport live with the consumer, not in core.** In Raak they sit in the
  `agent` product (`modules/agent/{run-model,completions-adapter,system-prompt}.ts`); `run-model.ts`
  imports `buildTools` from `#/modules/ai/tool-registry` (the **agent → ai** direction). Cella core
  has no such files — a Cella-only fork that wants AI adds its own (see Phase 5).
- **Route metadata** `x-tool` exists in [../backend/src/core/extensions.ts](../backend/src/core/extensions.ts)
  (`enabled`, `description`, `approvalRequired`, `category`) but is **not yet wired** to either the
  tool registry or the MCP server.

Known gaps (the subject of this plan):

1. MCP auth is **cookie/session only** — fine for the in-browser app, not for external MCP clients.
2. Tools must be hand-written in `buildTools`; the `x-tool` route metadata is inert.
3. No transport beyond single-shot JSON-RPC over POST (no streaming/SSE, no `resources`/`prompts`).
4. No per-tool authorization, rate limiting, audit, or approval flow for write tools.
5. No discovery/manifest endpoint for external clients.

## Design constraints (apply to every phase)

- **Cella-first, fork-agnostic.** Everything lands in Cella core `modules/ai`. Raak adds tools and the
  agent product; it never re-implements MCP.
- **No chat coupling.** The MCP server must keep zero imports from any chat/message/agent code. This is
  the invariant that lets Cella ship MCP without an agent.
- **One registry.** New tool sources feed `buildTools(ctx)` (or a successor registry), never a
  parallel MCP-only list. The agent and MCP always see the same tools.
- **Tenant isolation preserved.** Every tool call runs inside the caller's `AuthContext`
  (`tenantId`/`organizationId`/`userId`), under existing RLS and guards.
- **Opt-in.** MCP stays behind `appConfig.has.ai`. Cella default `false`; Raak `true`.

---

## Phase 1 — External auth for the MCP endpoint

**Problem:** external MCP clients (Claude Desktop, IDEs, agents) can't present a browser session cookie.

**Approach:** add a bearer-token auth path that resolves to the same `AuthContext` the guards produce,
without weakening the in-app cookie path.

- Introduce an `mcp_access` token type (reuse the existing `tokensTable` +
  `appConfig.tokenTypes`; tokens are hashed at rest, see [../backend/src/db/schema/tokens.ts](../backend/src/db/schema/tokens.ts)).
- Token is **scoped**: `{ userId, tenantId, organizationId, scopes[], expiresAt }`. Scopes gate which
  tool categories are callable (ties into Phase 4).
- Add an `mcpAuthGuard` that accepts `Authorization: Bearer <token>` **or** falls back to the existing
  session cookie, then populates the same context variables `tenantGuard`/`orgGuard` expect. Keep the
  guard in `modules/ai/mcp/` so it ships with the MCP feature.
- Document a second `securityScheme` (`http`/`bearer`) in [../backend/src/core/init-docs.ts](../backend/src/core/init-docs.ts)
  alongside the existing `cookieAuth`, attached only to the MCP route.
- Add `me`-style routes to **mint/list/revoke** MCP tokens (personal access tokens), so a user can
  generate a token for their workspace from the UI.

**Cella vs Raak:** identical. Cella ships the token type + guard + management routes; Raak inherits
them. Token issuance UI can live in Cella's settings module so both apps get it.

**Exit:** an external client can authenticate to `/:tenantId/:organizationId/mcp` with a bearer token
and `tools/list` returns the workspace's tools.

---

## Phase 2 — Bridge `x-tool` route metadata into the tool registry

**Problem:** `x-tool` is declared on routes but does nothing; tools must be re-authored by hand.

**Approach:** make annotated OpenAPI routes a *tool source* that feeds the same registry.

- Add `mcp/route-tool-source.ts` that walks the generated OpenAPI document (already produced by
  [../backend/src/core/init-docs.ts](../backend/src/core/init-docs.ts)), selects operations whose
  route carries `x-tool.enabled`, and maps each to a `ServerTool`:
  - `name` = `operationId`
  - `description` = `x-tool.description`
  - `inputSchema` = the route's request (params + query + body) schema
  - `metadata.category` = `x-tool.category`; `needsApproval` = `x-tool.approvalRequired`
  - `execute` = invoke the corresponding Hono handler **in-process** under the caller's
    `AuthContext` (reuses guards, RLS, validation — no HTTP self-call).
- First, fix the metadata pass-through: `createXRoute` currently only preserves *middleware*
  extensions; ensure *metadata* extensions (`x-tool`) survive into the route spec
  ([../backend/src/core/x-routes.ts](../backend/src/core/x-routes.ts),
  [../backend/src/core/extensions.ts](../backend/src/core/extensions.ts)). Add a test asserting an
  `x-tool` route appears in `openapi.cache.json`.
- Compose tool sources in `tool-source.ts`:
  `getMcpTools(ctx) = [...buildTools(ctx), ...routeTools(ctx)]`. `buildTools` stays the place for
  hand-written/bespoke tools; route-derived tools come for free from annotations.

**Cella vs Raak:** Cella annotates a couple of safe read routes (e.g. "get organization",
"list attachments") as a worked example. Raak annotates its product routes (tasks/projects) and they
appear in both the chat agent and MCP automatically.

**Exit:** annotating a route with `x-tool` makes it callable from MCP **and** usable by the in-app
model, with no extra code.

---

## Phase 3 — Transport completeness (streamable HTTP + capabilities)

**Problem:** current transport is single-shot JSON-RPC over POST; real MCP clients expect streaming
and the broader method surface.

**Approach:** extend the existing handler rather than swapping it.

- Add the **Streamable HTTP** transport (SSE for server→client, POST for client→server) so long tool
  runs and progress notifications work. Keep the single-shot POST path for simple clients.
- Implement `tools/list` pagination (`nextCursor`) and emit `notifications/tools/list_changed` if/when
  the registry becomes dynamic.
- Optionally add `resources/*` and `prompts/*`:
  - **resources** — expose read-only context (e.g. an organization summary, a doc) as MCP resources.
  - **prompts** — expose reusable prompt templates (e.g. Raak's system prompt) so external clients can
    invoke the same agent framing.
- Consider adopting `@modelcontextprotocol/sdk` *only* if the hand-rolled handler becomes a
  maintenance burden; today the zero-dep handler is small and fully under our control. Decide at the
  start of this phase.

**Cella vs Raak:** transport is identical. `prompts` is where they differ in *content*: Raak can
publish its agent prompt; Cella may publish none or a generic one.

**Exit:** Claude Desktop / an MCP IDE can connect, stream a tool call, and (optionally) read resources
and prompts.

---

## Phase 4 — Authorization, safety, and observability per tool

**Problem:** all tools are equally callable; writes have no gate; no audit trail.

**Approach:** layer policy on top of the registry, reusing existing infra.

- **Scopes/categories:** the MCP token's `scopes[]` filter `tools/list` and authorize `tools/call` by
  `x-tool.category`. Read vs write derived from `x-tool.approvalRequired` / HTTP method.
- **Approval flow for writes:** for `approvalRequired` tools, return an MCP "elicitation"/confirmation
  step (or require a per-call confirmation token) before executing. The in-app agent already models
  tool-call approval; mirror that contract.
- **Rate limiting:** attach the existing `xRateLimiter` extension to the MCP route, and optionally a
  per-tool budget keyed by `(userId, toolName)`.
- **Audit:** log every `tools/call` (tool, args hash, caller, tenant, latency, outcome) via the
  existing logger/OTel ([./OTEL.md](./OTEL.md)); add `sync.mcp.*` style metrics (calls, errors,
  approvals).
- **Guardrails:** enforce input-size limits and redact secrets in tool output (reuse pino redaction).

**Cella vs Raak:** identical mechanism. Raak will have more write tools (tasks), so its approval and
rate-limit config matters more; Cella ships safe defaults.

**Exit:** write tools require approval, every call is audited, abusive callers are rate-limited.

---

## Phase 5 — Standalone AI (no agent), as a fork recipe

This phase realizes the "fits both perspectives" requirement explicitly. The key point: Cella core
ships **no** model runner or LLM transport, so "AI functionality" is something a fork adds on top of
the registry — not something core does for you.

**Cella fork (standalone AI, no chat):**

- A fork that wants a simple AI feature (rewrite text, summarize, classify) adds a **non-streaming**
  call directly: `openai.chat.completions.create({ stream: false, … })`, read
  `choices[0].message.content`. No adapter, no agent loop, no streaming machinery — a transform
  doesn't need a stream. This stays a few lines in the fork's own module.
- If the fork wants tool use too, it reuses `buildTools(ctx)` from `#/modules/ai/tool-registry` and
  passes the tools to its call. The same tools are already exposed over MCP.
- Document a recipe: "add an AI feature" — (1) optionally annotate routes with `x-tool` (Phase 2) so
  they become tools, (2) optionally add a bespoke tool in `buildTools`, (3) make a model call (a
  one-shot `completions.create`, or a streaming runner if the fork wants chat). MCP exposure of the
  tools is automatic; the model call is the fork's choice.
- **Do not** add a core `runModel`/`/ai/run` route. Keeping the model call out of core is what lets
  Cella ship MCP with zero LLM transport. The streaming runner only exists where a streaming product
  (an agent) needs it.

**Raak (agent + optional standalone AI):**

- The chat `agent` module owns its model runner (`modules/agent/run-model.ts`), persistence, and
  history. It reuses `buildTools` from `#/modules/ai`. No change beyond registering domain tools.
- For non-chat AI (e.g. "summarize this project"), Raak makes a one-shot non-streaming call in the
  relevant module — it does **not** need to spin up the agent or a chat session.
- Optionally expose the agent itself over MCP as a `prompts`/`resources` provider (Phase 3), so
  external clients can drive Raak's agent framing.

**Exit:** Cella has MCP + a documented AI recipe with zero LLM transport in core; Raak has agent +
MCP + optional one-shot AI, all sharing one registry.

---

## Cella vs Raak — responsibility matrix

| Concern | Cella core (`modules/ai`) | Raak |
| --- | --- | --- |
| MCP server (transport, JSON-RPC) | Owns | Inherits |
| Tool registry `buildTools` | Empty default + examples | Registers domain tools (tasks, projects…) |
| `mcpAuthGuard` + token type + token mgmt UI | Owns | Inherits |
| `x-tool` → registry bridge | Owns | Inherits |
| LLM transport (adapter) + model runner | **None** | Owns (`modules/agent`) |
| Chat `agent` product (chat/message, persistence) | **None** | Owns (`modules/agent`) |
| Standalone one-shot AI call | Fork recipe (docs) | Adds in its own module |
| `prompts`/`resources` content | Generic/none | Publishes agent prompt + context |
| `appConfig.has.ai` default | `false` | `true` |

## Suggested sequencing

1. **Phase 1 (auth)** — unblocks any real external use; small, self-contained.
2. **Phase 2 (`x-tool` bridge)** — highest leverage; turns the whole API into MCP tools declaratively.
3. **Phase 4 (authz/safety)** — must land before write tools are exposed externally.
4. **Phase 3 (transport)** — needed for first-class client UX; can lag behind read-only usage.
5. **Phase 5 (standalone AI recipe)** — mostly docs; a fork adds a one-shot model call. Can be done
   anytime after Phase 2.

## Open questions

- **SDK vs hand-rolled:** adopt `@modelcontextprotocol/sdk` (more spec coverage, more deps) or keep the
  zero-dep handler (full control, less surface)? Decide at Phase 3.
- **Token model:** personal access tokens (per user) vs workspace service tokens (per org) — likely
  both, with distinct scopes.
- **Tool granularity:** expose every CRUD route as a tool, or a curated subset? Default to curated via
  explicit `x-tool.enabled` opt-in (never auto-expose).
- **Multi-tenant routing:** MCP endpoint is per-workspace (`/:tenantId/:organizationId/mcp`). Do we
  also want a tenant-level endpoint that lists the caller's workspaces as resources?
- **In-process vs HTTP execution:** Phase 2 assumes in-process handler invocation (reuses guards). Confirm
  no handler relies on raw transport details that break under synthetic invocation.

## References

- Model Context Protocol — <https://modelcontextprotocol.io>
- AI capability layer — `backend/src/modules/ai/` (`tool-registry.ts`, `mcp/`)
- Model runner + LLM transport (fork-owned) — e.g. Raak `backend/src/modules/agent/`
  (`run-model.ts`, `completions-adapter.ts`, `system-prompt.ts`)
- MCP server — `backend/src/modules/ai/mcp/`
- Route extension metadata (`x-tool`) — [../backend/src/core/extensions.ts](../backend/src/core/extensions.ts)
- OpenAPI doc generation — [../backend/src/core/init-docs.ts](../backend/src/core/init-docs.ts)
- Observability — [./OTEL.md](./OTEL.md)
