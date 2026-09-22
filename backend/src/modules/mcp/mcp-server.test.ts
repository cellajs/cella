import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import type { OrgContext } from '#/core/context';
import '#/modules/attachment/attachment-module';
import { defineTool } from '#/modules/mcp/define-tool';
import { handleMcpMessage, InsufficientScopeError } from '#/modules/mcp/mcp-server';
import { describeMcpTools } from '#/modules/mcp/tool-source';

/** Transport-level behavior needs no database: the registry is the attachment module's, the actor carries scopes. */
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
    const update = tools.find((tool) => tool.name === 'updateAttachment');
    expect(update?._meta.scope).toBe('attachment:write');
    expect(update?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    expect(update?.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
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

  it('rejects invalid arguments before executing', async () => {
    const res = await handleMcpMessage(contextWith(null), {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'deleteAttachments', arguments: { ids: [] } },
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

describe('defineTool', () => {
  it('derives name, scope and annotations from the route and refuses routes without x-tool', () => {
    const route = {
      operationId: 'listThings',
      method: 'get',
      'x-tool': { enabled: true, description: 'List things', approvalRequired: false, category: 'things' },
    };
    const tool = defineTool(route, { entity: 'attachment', inputSchema: z.object({}), execute: async () => [] });
    expect(tool).toMatchObject({ name: 'listThings', scope: 'attachment:read', annotations: { readOnlyHint: true } });
    expect(describeMcpTools([tool])[0].inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(() =>
      defineTool(
        { operationId: 'x', method: 'get' },
        { entity: 'attachment', inputSchema: z.object({}), execute: async () => null },
      ),
    ).toThrow();
  });
});
