import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { accessScopes, appConfig } from 'shared';
import type { Env } from '#/core/context';
import { toClientError } from '#/lib/error';
import type { McpTool } from '#/modules/mcp/mcp-tools';

/**
 * The revisions this server implements, newest first: those that open with `initialize`. The stateless revision
 * (2026-07-28) is not served, and the HTTP+SSE transport of 2024-11-05 is not either.
 */
export const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

/** Whether a revision a client names is one this server implements. */
export const isProtocolVersion = (version: unknown): version is (typeof protocolVersions)[number] =>
  protocolVersions.some((supported) => supported === version);

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Thrown by `tools/call` when the token lacks the tool's scope; the handler answers it with the RFC 6750 challenge. */
export class InsufficientScopeError extends Error {
  constructor(
    readonly scope: string,
    readonly id: string | number | null,
  ) {
    super('insufficient_scope');
    this.name = 'InsufficientScopeError';
  }
}

const serverInfo = { name: `${appConfig.name} MCP`, version: appConfig.apiVersion };

const isJsonRpcMessage = (message: unknown): message is JsonRpcMessage =>
  typeof message === 'object' && message !== null && 'method' in message && typeof message.method === 'string';

/** The id of a message that is not a request, when it can be read (JSON-RPC 2.0 §5: otherwise null). */
const readableId = (message: unknown): string | number | null =>
  typeof message === 'object' && message !== null && 'id' in message && (typeof message.id === 'string' || typeof message.id === 'number')
    ? message.id
    : null;

/** A response the client posts back (to a server request): acknowledged, never answered. */
const isJsonRpcResponse = (message: unknown) =>
  typeof message === 'object' && message !== null && !('method' in message) && ('result' in message || 'error' in message);

/**
 * Model Context Protocol server over JSON-RPC 2.0 (Streamable HTTP, JSON responses): `initialize`, `tools/list`,
 * `tools/call`, `ping`. Tools are the routes carrying `xTool`; the token's scopes gate execution, and a call runs the
 * route's own handler. Returns `null` for notifications (messages without an `id`) and for responses the client posts,
 * which must not get a reply, and answers anything else that is not a request object with Invalid Request.
 * @see https://modelcontextprotocol.io
 */
export async function handleMcpMessage(ctx: Context<Env>, message: unknown, tools: readonly McpTool[]): Promise<JsonRpcResponse | null> {
  if (isJsonRpcResponse(message)) return null;
  if (!isJsonRpcMessage(message)) return { jsonrpc: '2.0', id: readableId(message), error: { code: -32600, message: 'Invalid Request' } };
  // A request id is a string or a number; without one the message is a notification, and a null id is neither.
  if (message.id === null) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  if (message.id === undefined) return null;

  const id = message.id;
  const respond = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, msg: string, data?: unknown): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: msg, ...(data !== undefined && { data }) },
  });

  switch (message.method) {
    case 'initialize': {
      // The requested revision when this server implements it, else its newest, which the client may refuse.
      const requested = message.params?.protocolVersion;
      return respond({
        protocolVersion: isProtocolVersion(requested) ? requested : protocolVersions[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions:
          'Tools act inside one organization as the person or service account that authorized this client. A call answered with insufficient_scope needs a token carrying the named scope.',
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return respond({});

    case 'tools/list':
      return respond({ tools: tools.map((tool) => tool.descriptor) });

    case 'tools/call': {
      const name = typeof message.params?.name === 'string' ? message.params.name : undefined;
      if (!name) return fail(-32602, 'Invalid params: missing tool name');

      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);

      // The mask: a token names its scopes explicitly; a missing one is a step-up, never a refusal that leaves out the
      // scope to ask for.
      if (!accessScopes.allows(ctx.var.actor.scopes, tool.entity, tool.action)) throw new InsufficientScopeError(tool.scope, id);

      try {
        const outcome = await tool.call(ctx, message.params?.arguments);
        // Permission and domain failures are answers the model can act on, not transport errors.
        if (!outcome.ok) return respond({ content: [{ type: 'text', text: `${outcome.type}: ${outcome.detail}` }], isError: true });
        const { output } = outcome;
        const text = typeof output === 'string' ? output : JSON.stringify(output ?? null);
        return respond({ content: [{ type: 'text', text }], structuredContent: output ?? undefined });
      } catch (error) {
        // The route's schemas refused the arguments: a JSON-RPC params error with the issues.
        if (error instanceof z.ZodError) return fail(-32602, 'Invalid params', error.issues);
        // The call itself failed before the route answered. The model belongs to a third-party client, so a server
        // error reaches it without its internals, in every mode.
        const { type, detail } = toClientError(error, { tool: name, organizationId: ctx.var.organizationId }, { exposeServerMessage: false });
        return respond({ content: [{ type: 'text', text: `${type}: ${detail}` }], isError: true });
      }
    }

    default:
      return fail(-32601, `Method not found: ${message.method}`);
  }
}
