import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { mcpRoutes } from '#/modules/mcp/mcp-routes';
import { handleMcpMessage, InsufficientScopeError, isProtocolVersion, type JsonRpcResponse, protocolVersions } from '#/modules/mcp/mcp-server';
import { getMcpTools } from '#/modules/mcp/mcp-tools';
import { bearerChallenge, protectedResourceMetadata } from '#/modules/oauth-server/resources';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * The JSON-RPC code of a call outside the token's scopes: an application's own, outside the range JSON-RPC reserves
 * (-32768 to -32000), whose codes MCP defines, -32002 among them for a missing resource.
 */
const insufficientScopeCode = -31403;

/** The JSON-RPC error of a call outside the token's scopes, naming the scope to ask for. */
const insufficientScope = ({ id, scope }: InsufficientScopeError) =>
  ({
    jsonrpc: '2.0',
    id,
    error: { code: insufficientScopeCode, message: 'insufficient_scope', data: { scope } },
  }) satisfies JsonRpcResponse;

/** Step-up (RFC 6750 §3.1): the challenge names the missing scopes, so the client re-authorizes with them and retries. */
const scopeChallenge = ({ tenantId, organizationId }: { tenantId: string; organizationId: string }, scopes: string[]) =>
  bearerChallenge(
    { face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId },
    { error: 'insufficient_scope', scope: [...new Set(scopes)].join(' ') },
  );

const appOrigin = new URL(appConfig.frontendUrl).origin;

/**
 * What the transport refuses before it reads a message: a browser page on another origin (403, against DNS rebinding)
 * and a revision in `MCP-Protocol-Version` this server does not implement (400). A request without either header passes.
 */
const assertTransport = (ctx: Context<Env>) => {
  const origin = ctx.req.header('origin');
  if (origin !== undefined && origin !== appOrigin) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'invalid_origin' } });

  const version = ctx.req.header('mcp-protocol-version');
  // A problem body, no JSON-RPC error: a client that tried the stateless revision reads it as an older server and sends `initialize`.
  if (version !== undefined && !isProtocolVersion(version)) {
    throw new AppError(400, 'invalid_request', 'info', { meta: { reason: 'unsupported_protocol_version', supported: [...protocolVersions] } });
  }
};

app.openapi(mcpRoutes.getMcpProtectedResourceMetadata, async (ctx) => {
  const { tenantId, organizationId } = ctx.req.valid('param');
  return ctx.json(protectedResourceMetadata({ face: 'mcp', tenantId: tenantId.toLowerCase(), organizationId }), 200);
});

// The endpoint opens no stream for a GET and holds no session for a DELETE to end; the route documents both answers.
app.on(['GET', 'DELETE'], '/', (ctx) => {
  assertSwitchOn({ service: 'mcp' });
  return ctx.body(null, 405, { Allow: 'POST' });
});

// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC bodies are dynamic and notifications return 202 with no body
app.openapi(mcpRoutes.handleMcp, async (ctx): Promise<any> => {
  assertTransport(ctx);
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
