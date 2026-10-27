import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { mcpRoutes } from '#/modules/mcp/mcp-routes';
import { handleMcpMessage, InsufficientScopeError, type JsonRpcResponse } from '#/modules/mcp/mcp-server';
import { getMcpTools } from '#/modules/mcp/mcp-tools';
import { protectedResourceMetadata, resourceMetadataUrl } from '#/modules/oauth-server/resources';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

/** The JSON-RPC error of a call outside the token's scopes, naming the scope to ask for. */
const insufficientScope = ({ id, scope }: InsufficientScopeError): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code: -32002, message: 'insufficient_scope', data: { scope } },
});

/** Step-up (RFC 6750 §3.1): the challenge names the missing scopes, so the client re-authorizes with them and retries. */
const scopeChallenge = ({ tenantId, organizationId }: { tenantId: string; organizationId: string }, scopes: string[]) => {
  const metadata = resourceMetadataUrl({ face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId });
  return `Bearer error="insufficient_scope", scope="${[...new Set(scopes)].join(' ')}", resource_metadata="${metadata}"`;
};

app.openapi(mcpRoutes.getMcpProtectedResourceMetadata, async (ctx) => {
  const { tenantId, organizationId } = ctx.req.valid('param');
  return ctx.json(protectedResourceMetadata({ face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId }), 200);
});

// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC bodies are dynamic and notifications return 202 with no body
app.openapi(mcpRoutes.handleMcp, async (ctx): Promise<any> => {
  const body: unknown = ctx.req.valid('json');
  const tools = await getMcpTools();

  // A JSON-RPC batch answers each call, notifications aside. A call outside the token's scopes gets its own error and
  // the others keep their results: answered as one 403, a client retrying the batch would run the earlier calls twice.
  // The 200 still carries the challenge, so a client that steps up on the header does so for a batch too.
  if (Array.isArray(body) && body.length > 0) {
    const responses: JsonRpcResponse[] = [];
    const missingScopes: string[] = [];
    for (const message of body) {
      const response = await handleMcpMessage(ctx, message, tools).catch((error) => {
        if (!(error instanceof InsufficientScopeError)) throw error;
        missingScopes.push(error.scope);
        return insufficientScope(error);
      });
      if (response) responses.push(response);
    }
    if (missingScopes.length) ctx.header('WWW-Authenticate', scopeChallenge(ctx.req.valid('param'), missingScopes));
    return responses.length ? ctx.json(responses, 200) : ctx.body(null, 202);
  }

  try {
    const response = await handleMcpMessage(ctx, body, tools);
    if (!response) return ctx.body(null, 202);
    return ctx.json(response, 200);
  } catch (error) {
    if (!(error instanceof InsufficientScopeError)) throw error;
    ctx.header('WWW-Authenticate', scopeChallenge(ctx.req.valid('param'), [error.scope]));
    return ctx.json(insufficientScope(error), 403);
  }
});

export const mcpHandlers = app;
