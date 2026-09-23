import { OpenAPIHono } from '@hono/zod-openapi';
import { accessScopes, appConfig } from 'shared';
import type { Env } from '#/core/context';
import { mcpRoutes } from '#/modules/mcp/mcp-routes';
import {
  handleMcpMessage,
  InsufficientScopeError,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from '#/modules/mcp/mcp-server';
import { resourceMetadataUrl, resourceUri } from '#/modules/oauth-server/resources';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(mcpRoutes.getMcpProtectedResourceMetadata, async (ctx) => {
  const { tenantId, organizationId } = ctx.req.valid('param');
  const ref = { face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId } as const;
  return ctx.json(
    {
      resource: resourceUri(ref),
      authorization_servers: [appConfig.oauthUrl],
      scopes_supported: [...accessScopes.all],
      bearer_methods_supported: ['header'],
      resource_documentation: `${appConfig.frontendUrl}/docs`,
    },
    200,
  );
});

// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC bodies are dynamic and notifications return 202 with no body
app.openapi(mcpRoutes.handleMcp, async (ctx): Promise<any> => {
  const body = ctx.req.valid('json') as JsonRpcMessage | JsonRpcMessage[];

  try {
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
    if (!response) return ctx.body(null, 202);
    return ctx.json(response, 200);
  } catch (error) {
    if (!(error instanceof InsufficientScopeError)) throw error;
    // Step-up (RFC 6750 §3.1): the client re-authorizes with the named scope and retries.
    const { tenantId, organizationId } = ctx.req.valid('param');
    const metadata = resourceMetadataUrl({ face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId });
    ctx.header(
      'WWW-Authenticate',
      `Bearer error="insufficient_scope", scope="${error.scope}", resource_metadata="${metadata}"`,
    );
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: error.id,
      error: { code: -32002, message: 'insufficient_scope', data: { scope: error.scope } },
    };
    return ctx.json(response, 403);
  }
});

export const mcpHandlers = app;
