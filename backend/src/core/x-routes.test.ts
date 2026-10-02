import { OpenAPIHono, z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { createXRoute, createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { errorResponseRefs } from '#/schemas';

const itemSchema = z.object({ id: z.string() });

describe('route helpers', () => {
  const routes = createXRoutes(['things', 'app'], {
    getThing: xRoute({
      method: 'get',
      path: '/{id}',
      xGuard: [publicGuard],
      summary: 'Get thing',
      description: 'Returns a thing.',
      request: { params: itemSchema },
      responses: { 200: json('Thing', itemSchema, { id: 'a' }) },
    }),
    createThing: xRoute({
      operationId: 'thingCreate',
      method: 'post',
      path: '/',
      xGuard: [publicGuard],
      summary: 'Create thing',
      description: 'Creates a thing.',
      request: { body: jsonBody(itemSchema) },
      responses: { 201: json('Created', itemSchema) },
    }),
  });

  it('names a route by its key, first, and places the module tags right before the summary', () => {
    const keys = Object.keys(routes.getThing).filter((key) => key !== 'security');
    expect(keys.slice(0, 2)).toEqual(['operationId', 'method']);
    expect(keys.indexOf('tags')).toBe(keys.indexOf('summary') - 1);
    expect(routes.getThing).toMatchObject({ operationId: 'getThing', tags: ['things', 'app'] });
  });

  it('keeps an operationId the route sets', () => {
    expect(routes.createThing.operationId).toBe('thingCreate');
  });

  it('appends the error responses to every route, after its own', () => {
    expect(Object.keys(routes.getThing.responses)).toEqual(['200', ...Object.keys(errorResponseRefs)]);
    expect(routes.createThing.responses).toMatchObject({ 201: { description: 'Created' }, ...errorResponseRefs });
  });

  it('builds a JSON response with its example only when given, and a required JSON body', () => {
    expect(json('Thing', itemSchema)).toEqual({
      description: 'Thing',
      content: { 'application/json': { schema: itemSchema } },
    });
    expect(routes.getThing.responses[200].content['application/json']).toEqual({ schema: itemSchema, example: { id: 'a' } });
    expect(routes.createThing.request.body).toEqual({
      required: true,
      content: { 'application/json': { schema: itemSchema } },
    });
  });

  it('appends the error responses in createXRoute too, where a route spreading them keeps one copy', () => {
    const route = createXRoute({
      operationId: 'single',
      method: 'get',
      path: '/single',
      xGuard: [publicGuard],
      tags: ['things'],
      summary: 'Single',
      responses: { 204: { description: 'Done' }, ...errorResponseRefs },
    });
    expect(Object.keys(route.responses)).toEqual(['204', ...Object.keys(errorResponseRefs)]);
  });

  it('refuses a route whose config switch is off before its guards, and documents the switch as x-enabled-by', async () => {
    const guardRan = vi.fn();
    const guard = xMiddleware({ functionName: 'recordingGuard', type: 'x-guard' }, async (_ctx, next) => {
      guardRan();
      await next();
    });
    const route = createXRoute({
      operationId: 'switched',
      method: 'get',
      path: '/switched',
      xEnabledBy: { service: 'mcp' },
      xGuard: [guard],
      tags: ['things'],
      summary: 'Switched',
      responses: { 204: { description: 'Done' } },
    });
    expect(route).toMatchObject({ 'x-enabled-by': { service: 'mcp' } });
    expect(route).not.toHaveProperty('xEnabledBy');

    const app = new OpenAPIHono<Env>();
    app.openapi(route, (ctx) => ctx.body(null, 204));
    app.onError((error, ctx) => ctx.json({ status: error instanceof AppError ? error.status : 500 }));

    const enabled = appConfig.services.mcp.enabled;
    onTestFinished(() => {
      appConfig.services.mcp.enabled = enabled;
    });
    appConfig.services.mcp.enabled = false;
    expect(await (await app.request('/switched')).json()).toEqual({ status: 404 });
    expect(guardRan).not.toHaveBeenCalled();

    // Positive control: switched on, the guard runs and the route answers.
    appConfig.services.mcp.enabled = true;
    expect((await app.request('/switched')).status).toBe(204);
    expect(guardRan).toHaveBeenCalledOnce();
  });
});
