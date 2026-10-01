import { OpenAPIHono, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { baseDb } from '#/db/db';
import { publicGuard } from '#/middlewares/guard';
import { handleMcpMessage, InsufficientScopeError, type JsonRpcMessage } from '#/modules/mcp/mcp-server';
import { buildMcpTools, type McpToolDescriptor } from '#/modules/mcp/mcp-tools';
import { createBaseApp } from '#/server';
import { defaultHook } from '#/utils/default-hook';

/** Transport-level behavior needs no session: the tools are the mounted app's, the actor carries scopes. */
const contextWith = (scopes: string[] | null) =>
  ({
    var: { actor: { kind: 'service', scopes }, tenantId: 'tenant-1', organizationId: 'org-1' },
    req: { url: 'http://localhost/tenant-1/org-1/mcp', header: () => undefined },
    env: undefined,
  }) as unknown as Context<Env>;

const { baseApp } = await import('#/routes');
const appTools = buildMcpTools(baseApp);
const handle = (scopes: string[] | null, message: JsonRpcMessage) => handleMcpMessage(contextWith(scopes), message, appTools);

describe('mcp-server', () => {
  it('responds to initialize with protocol version, capabilities, and server info', async () => {
    const res = await handle(null, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res).not.toBeNull();
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBeTypeOf('string');
    expect(result.capabilities).toMatchObject({ tools: { listChanged: false } });
    expect(result.serverInfo).toHaveProperty('name');
  });

  it('echoes the client requested protocol version on initialize', async () => {
    const res = await handle(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2024-11-05');
  });

  it('lists the attachment tools with scope, annotations and a strict input schema', async () => {
    const res = await handle(['attachment:read'], { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const { tools } = (res?.result ?? {}) as { tools: McpToolDescriptor[] };
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['getAttachments', 'getAttachment', 'createAttachments', 'updateAttachment', 'deleteAttachments']));
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const properties = (name: string) => Object.keys((byName[name].inputSchema as { properties: object }).properties);
    expect(byName.updateAttachment._meta.scope).toBe('attachment:write');
    expect(byName.updateAttachment.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    // Path params minus the route's own, plus the body without its sync transaction.
    expect(byName.updateAttachment.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(properties('updateAttachment')).toEqual(expect.arrayContaining(['id', 'ops']));
    expect(properties('updateAttachment')).not.toContain('stx');
    expect(properties('createAttachments')).toEqual(['items']);
    expect(tools.find((tool) => tool.name === 'getAttachments')?.annotations.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === 'deleteAttachments')?.annotations.destructiveHint).toBe(true);
  });

  it('refuses a call outside the token scopes with the scope to step up to', async () => {
    await expect(
      handle(['attachment:read'], {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'updateAttachment', arguments: { id: 'x' } },
      }),
    ).rejects.toMatchObject(new InsufficientScopeError('attachment:write', 6));
  });

  it('rejects arguments the route schema refuses, before executing', async () => {
    const res = await handle(null, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'updateAttachment', arguments: { id: 'x', ops: {} } },
    });
    expect(res?.error?.code).toBe(-32602);
  });

  it('answers ping with an empty result', async () => {
    const res = await handle(null, { jsonrpc: '2.0', id: 3, method: 'ping' });
    expect(res?.result).toEqual({});
  });

  it('returns no response for notifications', async () => {
    const res = await handle(null, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toBeNull();
  });

  it('errors on unknown method (method not found)', async () => {
    const res = await handle(null, { jsonrpc: '2.0', id: 4, method: 'does/not-exist' });
    expect(res?.error?.code).toBe(-32601);
  });

  describe('a failing tool', () => {
    const failRoutes = createXRoutes(['things'], {
      brokenQueryTool: xRoute({
        method: 'get',
        path: '/broken',
        xGuard: [publicGuard],
        xTool: { description: 'Fails', approvalRequired: false, entity: 'attachment' },
        summary: 'Broken query',
        responses: { 200: json('ok', z.any()) },
      }),
      missingThingTool: xRoute({
        method: 'get',
        path: '/missing',
        xGuard: [publicGuard],
        xTool: { description: 'Fails', approvalRequired: false, entity: 'attachment' },
        summary: 'Missing thing',
        responses: { 200: json('ok', z.any()) },
      }),
    });
    const failing = new OpenAPIHono<Env>({ defaultHook });
    failing.openapi(failRoutes.brokenQueryTool, async (ctx) =>
      ctx.json(await baseDb.execute(sql`select * from mcp_missing_table where token = ${'param-secret-value'}`), 200),
    );
    failing.openapi(failRoutes.missingThingTool, () => {
      throw new AppError(404, 'not_found', 'warn', { entityType: 'attachment' });
    });
    const app = createBaseApp();
    app.route('/:tenantId/:organizationId/things', failing);
    const failingTools = buildMcpTools(app);

    const call = (name: string) =>
      handleMcpMessage(contextWith(null), { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name } }, failingTools);

    it('must not leak SQL or query parameters to the model via a failing query', async () => {
      const res = await call('brokenQueryTool');
      expect(res?.result).toEqual({
        content: [{ type: 'text', text: 'server_error: Internal server error' }],
        isError: true,
      });
      expect(JSON.stringify(res)).not.toMatch(/select|mcp_missing_table|param-secret-value/i);
    });

    it('answers a domain failure with its type and message (positive control)', async () => {
      const { message } = new AppError(404, 'not_found', 'warn', { entityType: 'attachment' });
      expect(message).not.toBe('');

      const res = await call('missingThingTool');
      expect(res?.result).toEqual({ content: [{ type: 'text', text: `not_found: ${message}` }], isError: true });
    });
  });

  it('errors when calling a tool that is not registered', async () => {
    const res = await handle(null, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'missing_tool', arguments: {} },
    });
    expect(res?.error?.code).toBe(-32602);
  });
});
