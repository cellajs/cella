import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import type { OrgContext } from '#/core/context';
import { getRouteTools, registerRouteTool } from './tool-registry';

const ctx = {} as OrgContext;
const meta = (execute: (ctx: OrgContext, input: never) => Promise<unknown>) => ({
  enabled: true,
  description: 'x',
  approvalRequired: false,
  category: 'test',
  entity: 'attachment' as const,
  execute,
});

const registered = (name: string) => {
  const tool = getRouteTools().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} not registered`);
  return tool;
};

describe('registerRouteTool', () => {
  it("derives the input from params minus the route's own ids plus the query, and splits them back for execute", async () => {
    const calls: unknown[] = [];
    registerRouteTool(
      {
        operationId: 'listThings',
        method: 'get',
        request: {
          params: z.object({ tenantId: z.string(), organizationId: z.string(), id: z.string() }),
          query: z.object({ q: z.string().optional(), limit: z.string().regex(/^\d+$/).transform(Number).optional() }),
        },
      },
      meta(async (_ctx, input) => {
        calls.push(input);
        return null;
      }),
    );
    const tool = registered('listThings');
    expect(tool.scope).toBe('attachment:read');
    expect(Object.keys((tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape)).toEqual(['id', 'q', 'limit']);

    await tool.run(ctx, { id: 'thing-1', q: 'hi', limit: '5' });
    // Query values validate through the route's own schema, so its coercions apply.
    expect(calls[0]).toEqual({ params: { id: 'thing-1' }, query: { q: 'hi', limit: 5 }, body: undefined });
    await expect(tool.run(ctx, { id: 'thing-1', limit: 'five' })).rejects.toThrow();
  });

  it('nests an array body under items and rebuilds the sync transaction per item', async () => {
    const calls: unknown[] = [];
    registerRouteTool(
      {
        operationId: 'createThings',
        method: 'post',
        request: {
          params: z.object({ tenantId: z.string(), organizationId: z.string() }),
          body: {
            content: {
              'application/json': {
                schema: z.array(
                  z.object({ name: z.string(), stx: z.object({ mutationId: z.string(), sourceId: z.string() }) }),
                ),
              },
            },
          },
        },
      },
      meta(async (_ctx, input) => {
        calls.push(input);
        return null;
      }),
    );
    const tool = registered('createThings');
    expect(tool.scope).toBe('attachment:write');
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(Object.keys((tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape)).toEqual(['items']);

    await tool.run(ctx, { items: [{ name: 'a' }, { name: 'b' }] });
    const { body } = calls[0] as { body: { name: string; stx: { sourceId: string } }[] };
    expect(body.map((item) => item.name)).toEqual(['a', 'b']);
    expect(body.every((item) => item.stx.sourceId === 'server')).toBe(true);
  });

  it('refuses a second registration of the same operation', () => {
    expect(() =>
      registerRouteTool(
        { operationId: 'listThings', method: 'get' },
        meta(async () => null),
      ),
    ).toThrow();
  });
});
