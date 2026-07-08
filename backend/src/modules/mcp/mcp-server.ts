import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { describeMcpTools, getMcpTools } from '#/modules/mcp/tool-source';

/**
 * Minimal Model Context Protocol (MCP) server over JSON-RPC 2.0.
 *
 * Implements the core methods MCP clients rely on (`initialize`, `tools/list`,
 * `tools/call`, `ping`) and exposes Cella's server tool registry. Tools are the
 * same ones the in-app model runner uses, so a fork declares a capability once
 * in `buildTools` and it is available to both surfaces.
 *
 * @see https://modelcontextprotocol.io
 */
const PROTOCOL_VERSION = '2025-06-18';

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

const serverInfo = { name: `${appConfig.name} MCP`, version: appConfig.apiVersion };

/**
 * Handle a single JSON-RPC message. Returns the response, or `null` for
 * notifications (messages without an `id`), which must not produce a reply.
 */
export async function handleMcpMessage(ctx: AuthContext, message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
  const isNotification = message.id === undefined || message.id === null;
  const id = message.id ?? null;
  const respond = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, msg: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message: msg } });

  switch (message.method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion;
      return respond({
        protocolVersion: typeof requested === 'string' ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo,
      });
    }

    // Notifications are acknowledged with no response body.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return respond({});

    case 'tools/list':
      return respond({ tools: describeMcpTools(getMcpTools(ctx)) });

    case 'tools/call': {
      if (isNotification) return null;
      const name = typeof message.params?.name === 'string' ? message.params.name : undefined;
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      if (!name) return fail(-32602, 'Invalid params: missing tool name');

      const tool = getMcpTools(ctx).find((candidate) => candidate.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);

      try {
        const output = await tool.execute?.(args, { toolCallId: String(id) });
        const text = typeof output === 'string' ? output : JSON.stringify(output ?? null);
        return respond({ content: [{ type: 'text', text }] });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return respond({ content: [{ type: 'text', text }], isError: true });
      }
    }

    default:
      if (isNotification) return null;
      return fail(-32601, `Method not found: ${message.method}`);
  }
}
