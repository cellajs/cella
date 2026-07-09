import { describe, expect, it } from 'vitest';
import type { AuthContext } from '#/core/context';
import { handleMcpMessage } from '#/modules/mcp/mcp-server';
import { describeMcpTools, type ExecutableTool } from '#/modules/mcp/tool-source';

// The MCP server is chat-free: it only depends on the tool registry, not on any
// chat/message persistence. A minimal context is enough for these unit tests
// because the default tool registry ignores it.
const ctx = { var: {} } as unknown as AuthContext;

describe('mcp-server', () => {
  it('responds to initialize with protocol version, capabilities, and server info', async () => {
    const res = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res).not.toBeNull();
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBeTypeOf('string');
    expect(result.capabilities).toMatchObject({ tools: { listChanged: false } });
    expect(result.serverInfo).toHaveProperty('name');
  });

  it('echoes the client requested protocol version on initialize', async () => {
    const res = await handleMcpMessage(ctx, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    const result = res?.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe('2024-11-05');
  });

  it('returns an empty tool list for the default (fork-less) registry', async () => {
    const res = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res?.result).toEqual({ tools: [] });
  });

  it('answers ping with an empty result', async () => {
    const res = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 3, method: 'ping' });
    expect(res?.result).toEqual({});
  });

  it('returns no response for notifications', async () => {
    const res = await handleMcpMessage(ctx, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toBeNull();
  });

  it('errors on unknown method (method not found)', async () => {
    const res = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 4, method: 'does/not-exist' });
    expect(res?.error?.code).toBe(-32601);
  });

  it('errors when calling a tool that is not registered', async () => {
    const res = await handleMcpMessage(ctx, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'missing_tool', arguments: {} },
    });
    expect(res?.error?.code).toBe(-32602);
  });
});

describe('tool-source describeMcpTools', () => {
  it('describes a schema-less tool with an empty object input schema', () => {
    const tools: ExecutableTool[] = [{ name: 'noop', description: 'does nothing' }];
    const [descriptor] = describeMcpTools(tools);
    expect(descriptor).toMatchObject({ name: 'noop', description: 'does nothing' });
    expect(descriptor.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });
});
