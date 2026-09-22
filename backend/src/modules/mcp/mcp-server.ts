import { appConfig, scopes } from 'shared';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { ToolBinding } from '#/modules/mcp/define-tool';
import { getTools } from '#/modules/mcp/tool-registry';
import { describeMcpTools } from '#/modules/mcp/tool-source';

/**
 * Model Context Protocol server over JSON-RPC 2.0 (Streamable HTTP, JSON responses): `initialize`, `tools/list`,
 * `tools/call`, `ping`. Tools come from the module registry; the token's scopes gate execution.
 * @see https://modelcontextprotocol.io
 */
const PROTOCOL_VERSION = '2026-07-28';

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

/** Thrown by `tools/call` when the token lacks the tool's scope; the handler turns it into the RFC 6750 challenge. */
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

/** Returns `null` for notifications (messages without an `id`), which must not get a reply. */
export async function handleMcpMessage(ctx: OrgContext, message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
  const isNotification = message.id === undefined || message.id === null;
  const id = message.id ?? null;
  const respond = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, msg: string, data?: unknown): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: msg, ...(data !== undefined && { data }) },
  });

  switch (message.method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion;
      return respond({
        protocolVersion: typeof requested === 'string' ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo,
        instructions:
          'Tools act inside one organization as the person or service account that authorized this client. A call answered with insufficient_scope needs a token carrying the named scope.',
      });
    }

    // Notifications are acknowledged with no response body.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return respond({});

    case 'tools/list':
      return respond({ tools: describeMcpTools(getTools()) });

    case 'tools/call': {
      if (isNotification) return null;
      const name = typeof message.params?.name === 'string' ? message.params.name : undefined;
      if (!name) return fail(-32602, 'Invalid params: missing tool name');

      const tool = getTools().find((candidate) => candidate.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);

      // The mask (D2): a token names its scopes explicitly; a missing one is a step-up, never a silent denial.
      const [entity, verb] = tool.scope.split(':') as [Parameters<typeof scopes.allows>[1], 'read' | 'write'];
      if (!scopes.allows(ctx.var.actor.scopes, entity, verb === 'read' ? 'read' : 'update'))
        throw new InsufficientScopeError(tool.scope, id);

      const parsed = tool.inputSchema.safeParse(message.params?.arguments ?? {});
      if (!parsed.success) return fail(-32602, 'Invalid params', parsed.error.issues);

      try {
        const output = await (tool as ToolBinding<unknown>).execute(ctx, parsed.data);
        const text = typeof output === 'string' ? output : JSON.stringify(output ?? null);
        return respond({ content: [{ type: 'text', text }], structuredContent: output ?? undefined });
      } catch (error) {
        // Permission and validation failures are answers the model can act on, not transport errors.
        const text = error instanceof AppError ? `${error.type}: ${error.message}` : String(error);
        return respond({ content: [{ type: 'text', text }], isError: true });
      }
    }

    default:
      if (isNotification) return null;
      return fail(-32601, `Method not found: ${message.method}`);
  }
}
