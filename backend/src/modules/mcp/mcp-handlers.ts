import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { mcpRoutes } from '#/modules/mcp/mcp-routes';
import { handleMcpMessage, type JsonRpcMessage, type JsonRpcResponse } from '#/modules/mcp/mcp-server';
import '#/modules/mcp/mcp-module';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC bodies are dynamic and notifications return 202 with no body
app.openapi(mcpRoutes.handleMcp, async (ctx): Promise<any> => {
  const body = ctx.req.valid('json') as JsonRpcMessage | JsonRpcMessage[];

  // JSON-RPC batch: collect responses, dropping notification (null) results.
  if (Array.isArray(body)) {
    const responses: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleMcpMessage(ctx, message);
      if (response) responses.push(response);
    }
    return responses.length ? ctx.json(responses, 200) : ctx.body(null, 202);
  }

  const response = await handleMcpMessage(ctx, body);
  if (!response) return ctx.body(null, 202); // notification: accepted, no body
  return ctx.json(response, 200);
});

export const mcpHandlers = app;
