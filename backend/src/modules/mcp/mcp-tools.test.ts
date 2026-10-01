import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { createBaseApp } from '#/server';
import { defaultHook } from '#/utils/default-hook';
import { buildMcpTools, type McpTool } from './mcp-tools';

const tool = (entity: 'attachment') => ({ description: 'A test tool', approvalRequired: false, entity });

const itemSchema = z.object({ name: z.string(), stx: z.object({ mutationId: z.string(), sourceId: z.string() }) });

const thingRoutes = createXRoutes(['things'], {
  listThings: xRoute({
    method: 'get',
    path: '/{id}',
    xGuard: [publicGuard],
    xTool: tool('attachment'),
    summary: 'List things',
    request: {
      params: z.object({ tenantId: z.string(), organizationId: z.string(), id: z.string() }),
      query: z.object({ q: z.string().optional(), limit: z.string().regex(/^\d+$/).transform(Number).optional() }),
    },
    responses: { 200: json('Things', z.any()) },
  }),
  createThings: xRoute({
    method: 'post',
    path: '/',
    xGuard: [publicGuard],
    xTool: tool('attachment'),
    summary: 'Create things',
    request: {
      params: z.object({ tenantId: z.string(), organizationId: z.string() }),
      body: jsonBody(z.array(itemSchema)),
    },
    responses: { 201: json('Created', z.any()) },
  }),
  refuseThing: xRoute({
    method: 'delete',
    path: '/{id}',
    xGuard: [publicGuard],
    xTool: tool('attachment'),
    summary: 'Refuse thing',
    request: { params: z.object({ tenantId: z.string(), organizationId: z.string(), id: z.string() }) },
    responses: { 200: json('Deleted', z.any()) },
  }),
});

const things = new OpenAPIHono<Env>({ defaultHook });
// Each handler answers with what the route received, so a test sees the request the tool sent.
things.openapi(thingRoutes.listThings, (ctx) =>
  ctx.json(
    { params: ctx.req.valid('param'), query: ctx.req.valid('query'), ip: ctx.req.header('x-forwarded-for') },
    200,
  ),
);
things.openapi(thingRoutes.createThings, (ctx) => ctx.json(ctx.req.valid('json'), 201));
things.openapi(thingRoutes.refuseThing, (ctx) => {
  if (ctx.req.valid('param').id === 'broken') throw new Error('select secret from things');
  throw new AppError(404, 'not_found', 'warn');
});

const app = createBaseApp();
app.route('/:tenantId/:organizationId/things', things);
const tools = buildMcpTools(app);

/** The MCP request a tool call runs inside: its organization, its client address, no bindings. */
const ctx = {
  var: { tenantId: 'tenant-1', organizationId: 'org-1' },
  req: {
    url: 'http://localhost/tenant-1/org-1/mcp',
    header: (name: string) => (name === 'x-forwarded-for' ? '203.0.113.7' : undefined),
  },
  env: undefined,
} as unknown as Context<Env>;

const named = (name: string): McpTool => {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`${name} is not a tool`);
  return found;
};

describe('buildMcpTools', () => {
  it("derives the input from params minus the route's own ids plus the query, and runs the route", async () => {
    const list = named('listThings');
    expect(list.scope).toBe('attachment:read');
    expect(Object.keys((list.descriptor.inputSchema as { properties: object }).properties)).toEqual([
      'id',
      'q',
      'limit',
    ]);

    // The route parses the raw query itself, so its coercions apply; the organization comes from the MCP request.
    const outcome = await list.call(ctx, { id: 'a/b', q: 'hi', limit: '5' });
    expect(outcome).toEqual({
      ok: true,
      output: {
        params: { tenantId: 'tenant-1', organizationId: 'org-1', id: 'a/b' },
        query: { q: 'hi', limit: 5 },
        ip: '203.0.113.7',
      },
    });
    await expect(list.call(ctx, { id: 'thing-1', limit: 'five' })).rejects.toBeInstanceOf(z.ZodError);
  });

  it('nests an array body under items and rebuilds the sync transaction per item', async () => {
    const create = named('createThings');
    expect(create.scope).toBe('attachment:write');
    expect(create.descriptor.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(Object.keys((create.descriptor.inputSchema as { properties: object }).properties)).toEqual(['items']);

    // A sync transaction the model sends is replaced by the server's own, item by item.
    const outcome = await create.call(ctx, {
      items: [{ name: 'a', stx: { mutationId: 'model', sourceId: 'model' } }, { name: 'b' }],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const body = outcome.output as { name: string; stx: { mutationId: string; sourceId: string } }[];
    expect(body.map((item) => item.name)).toEqual(['a', 'b']);
    expect(body.map((item) => item.stx.sourceId)).toEqual(['server', 'server']);
    expect(body[0].stx.mutationId).not.toBe('model');
  });

  it("answers with the route's error type and message, and never with a server error's internals", async () => {
    const refuse = named('refuseThing');
    expect(refuse.descriptor.annotations.destructiveHint).toBe(true);

    expect(await refuse.call(ctx, { id: 'missing' })).toMatchObject({ ok: false, type: 'not_found' });
    const broken = await refuse.call(ctx, { id: 'broken' });
    expect(broken).toEqual({ ok: false, type: 'server_error', message: 'Internal server error' });
  });

  it('refuses two routes with the same operation', () => {
    const twice = createBaseApp();
    twice.route('/:tenantId/:organizationId/a', things);
    twice.route('/:tenantId/:organizationId/b', things);
    expect(() => buildMcpTools(twice)).toThrow(/registered twice/);
  });
});
