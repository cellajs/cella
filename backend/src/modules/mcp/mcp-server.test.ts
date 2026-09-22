import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import type { OrgContext } from '#/core/context';
import { getRouteTools } from '#/core/tool-registry';
import { createXRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import '#/modules/attachment/attachment-routes';
import { handleMcpMessage, InsufficientScopeError } from '#/modules/mcp/mcp-server';
import { describeMcpTools } from '#/modules/mcp/tool-source';

/** Transport-level behavior needs no database: the registry is the attachment routes', the actor carries scopes. */
const contextWith = (scopes: string[] | null) =>
  ({ var: { actor: { kind: 'service', scopes } } }) as unknown as OrgContext;

describe('mcp-server', () => {
  it('responds to initialize with protocol version, capabilities, and server info', async () => {
    const res = await handleMcpMessage(contextWith(null), { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res).not.toBeNull();
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBeTypeOf('string');
    expect(result.capabilities).toMatchObject({ tools: { listChanged: false } });
    expect(result.serverInfo).toHaveProperty('name');
  });

  it('echoes the client requested protocol version on initialize', async () => {
    const res = await handleMcpMessage(contextWith(null), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2024-11-05');
  });

  it('lists the attachment tools with scope, annotations and a strict input schema', async () => {
    const res = await handleMcpMessage(contextWith(['attachment:read']), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const { tools } = (res?.result ?? {}) as { tools: ReturnType<typeof describeMcpTools> };
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'getAttachments',
        'getAttachment',
        'createAttachments',
        'updateAttachment',
        'deleteAttachments',
      ]),
    );
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const properties = (name: string) => Object.keys((byName[name].inputSchema as { properties: object }).properties);
    expect(byName.updateAttachment._meta.scope).toBe('attachment:write');
    expect(byName.updateAttachment.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
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
      handleMcpMessage(contextWith(['attachment:read']), {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'updateAttachment', arguments: { id: 'x' } },
      }),
    ).rejects.toMatchObject(new InsufficientScopeError('attachment:write', 6));
  });

  it('rejects arguments the route schema refuses, before executing', async () => {
    const res = await handleMcpMessage(contextWith(null), {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'updateAttachment', arguments: { id: 'x', ops: {} } },
    });
    expect(res?.error?.code).toBe(-32602);
  });

  it('answers ping with an empty result', async () => {
    const res = await handleMcpMessage(contextWith(null), { jsonrpc: '2.0', id: 3, method: 'ping' });
    expect(res?.result).toEqual({});
  });

  it('returns no response for notifications', async () => {
    const res = await handleMcpMessage(contextWith(null), { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toBeNull();
  });

  it('errors on unknown method (method not found)', async () => {
    const res = await handleMcpMessage(contextWith(null), { jsonrpc: '2.0', id: 4, method: 'does/not-exist' });
    expect(res?.error?.code).toBe(-32601);
  });

  it('errors when calling a tool that is not registered', async () => {
    const res = await handleMcpMessage(contextWith(null), {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'missing_tool', arguments: {} },
    });
    expect(res?.error?.code).toBe(-32602);
  });
});

describe('createXRoute with x-tool', () => {
  it('registers the route as a tool, derives the input from the request, and rebuilds the sync transaction', async () => {
    const calls: unknown[] = [];
    createXRoute({
      operationId: 'renameThing',
      method: 'put',
      path: '/{id}',
      xGuard: [publicGuard],
      'x-tool': {
        enabled: true,
        description: 'Rename a thing',
        approvalRequired: true,
        category: 'things',
        entity: 'attachment',
        execute: async (_ctx, { params, body }) => {
          calls.push({ id: params.id, name: body.ops.name, stx: body.stx });
          return { ok: true };
        },
      },
      request: {
        params: z.object({ tenantId: z.string(), organizationId: z.string(), id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({
                ops: z.object({ name: z.string() }),
                stx: z.object({
                  mutationId: z.string(),
                  sourceId: z.string(),
                  fieldTimestamps: z.record(z.string(), z.string()),
                }),
              }),
            },
          },
        },
      },
      responses: { 200: { description: 'ok' } },
    });
    const tool = getRouteTools().find((candidate) => candidate.name === 'renameThing');
    expect(tool).toMatchObject({
      scope: 'attachment:write',
      annotations: { readOnlyHint: false, idempotentHint: true },
    });
    expect(Object.keys((describeMcpTools([tool!])[0].inputSchema as { properties: object }).properties)).toEqual([
      'id',
      'ops',
    ]);

    await tool!.run(contextWith(null), { id: 'thing-1', ops: { name: 'renamed' } });
    expect(calls[0]).toMatchObject({ id: 'thing-1', name: 'renamed', stx: { sourceId: 'server' } });
    await expect(tool!.run(contextWith(null), { id: 'thing-1', ops: { name: 7 } })).rejects.toThrow();
  });
});
