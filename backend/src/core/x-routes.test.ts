import { OpenAPIHono, z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import type { XMiddlewareHandler } from '#/core/openapi-extensions';
import { xMiddleware } from '#/core/x-middleware';
import { createXRoute, createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { appErrorHandler } from '#/lib/error';
import { actorGuard, orgGuard, publicGuard, stepUpGuard, tenantGuard, tokenGuard, userGuard } from '#/middlewares/guard';
import { sharedErrorResponses } from '#/schemas';

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

  it('documents the error statuses the chain answers with beside the route’s own: validation for a request, the body limit for a body', () => {
    expect(Object.keys(routes.getThing.responses)).toEqual(['200', '400']);
    expect(routes.createThing.responses).toMatchObject({
      201: { description: 'Created' },
      400: sharedErrorResponses[400],
      413: sharedErrorResponses[413],
    });
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

  it('documents what the guards, limiters and errors() declare, and nothing for a public route without a request', () => {
    const route = (xGuard: XMiddlewareHandler[], responses: Parameters<typeof createXRoute>[0]['responses']) =>
      createXRoute({ operationId: 'single', method: 'get', path: '/{tenantId}/single', xGuard, tags: ['things'], summary: 'Single', responses });

    expect(Object.keys(route([publicGuard], { 204: { description: 'Done' } }).responses)).toEqual(['204']);
    expect(Object.keys(route([publicGuard], { 204: { description: 'Done' }, ...errors(404, 409) }).responses)).toEqual(['204', '404', '409']);
    expect(Object.keys(route([userGuard, tenantGuard, orgGuard], { 204: { description: 'Done' } }).responses)).toEqual(['204', '401', '403', '404']);
  });

  it('keeps the response a route declares for an error status, and adds the shared one for the others', () => {
    const forbidden = json('Refused with a body of its own', z.object({ reason: z.string() }));
    const route = createXRoute({
      operationId: 'ownError',
      method: 'get',
      path: '/{tenantId}/own-error',
      xGuard: [userGuard, tenantGuard],
      tags: ['things'],
      summary: 'Own error',
      responses: { 204: { description: 'Done' }, 403: forbidden },
    });
    expect(route.responses[403]).toBe(forbidden);
    expect(route.responses[401]).toBe(sharedErrorResponses[401]);
  });

  it('refuses at load errors() of a status the chain already answers with, naming what answers it', () => {
    const route =
      (xGuard: XMiddlewareHandler[], responses: Parameters<typeof createXRoute>[0]['responses'], request?: { params: typeof itemSchema }) => () =>
        createXRoute({ operationId: 'twice', method: 'get', path: '/{id}', xGuard, tags: ['things'], summary: 'Twice', request, responses });

    expect(route([userGuard], { 204: { description: 'Done' }, ...errors(401) })).toThrow(
      /twice \(get \/\{id\}\): errors\(401\) repeats the 401 that userGuard answers with/,
    );
    expect(route([publicGuard], { 204: { description: 'Done' }, ...errors(400) }, { params: itemSchema })).toThrow(
      /that request validation answers with/,
    );

    // Positive control: a status no part of the chain answers with.
    expect(route([userGuard], { 204: { description: 'Done' }, ...errors(409) })).not.toThrow();
  });

  it('answers an error status the route does not document as a 500 that names the fix, in tests', async () => {
    const app = new OpenAPIHono<Env>();
    app.openapi(
      createXRoute({
        operationId: 'throwsUndocumented',
        method: 'get',
        path: '/undocumented/{kind}',
        xGuard: [publicGuard],
        tags: ['things'],
        summary: 'Throws',
        request: { params: z.object({ kind: z.enum(['documented', 'undocumented']) }) },
        responses: { 204: { description: 'Done' }, ...errors(409) },
      }),
      (ctx) => {
        throw new AppError(ctx.req.valid('param').kind === 'documented' ? 409 : 404, 'not_found', 'warn');
      },
    );
    app.onError(appErrorHandler);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const undocumented = await app.request('/undocumented/undocumented');
    expect(undocumented.status).toBe(500);
    expect(await undocumented.json()).toMatchObject({
      type: 'server_error',
      message: expect.stringMatching(/throwsUndocumented answered 404.*errors\(404\)/),
    });
    expect(spy).toHaveBeenCalledOnce();

    // Positive controls: a documented status, and validation's 400, which every route with a request documents.
    expect((await app.request('/undocumented/documented')).status).toBe(409);
    expect((await app.request('/undocumented/other')).status).toBe(400);
  });

  it('refuses a route at load whose guard reads what no guard before it sets, and names the route', () => {
    const guarded = (xGuard: XMiddlewareHandler[]) => () =>
      createXRoute({
        operationId: 'getOrg',
        method: 'get',
        path: '/{tenantId}/{organizationId}',
        xGuard,
        tags: ['things'],
        summary: 'Get org',
        responses: { 204: { description: 'Done' } },
      });

    expect(guarded([userGuard, orgGuard, tenantGuard])).toThrow(/getOrg \(get \/\{tenantId\}\/\{organizationId\}\): orgGuard reads the tenant/);
    expect(guarded([tenantGuard, orgGuard])).toThrow(/tenantGuard reads the actor/);
    expect(guarded([actorGuard, stepUpGuard])).toThrow(/stepUpGuard reads the session/);

    // Positive controls: the chains routes use.
    for (const chain of [
      [userGuard, tenantGuard, orgGuard, stepUpGuard],
      [actorGuard, tenantGuard, orgGuard],
      [tokenGuard, tenantGuard, orgGuard],
    ]) {
      expect(guarded(chain)).not.toThrow();
    }
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

  it('refuses a tool route whose guards take no access token, and names it', () => {
    const toolRoute = (guard: typeof userGuard) =>
      createXRoute({
        operationId: 'getThings',
        method: 'get',
        path: '/things',
        xGuard: [guard],
        xTool: { description: 'Lists things', approvalRequired: false, entity: 'attachment' },
        tags: ['things'],
        summary: 'Get things',
        responses: { 204: { description: 'Done' } },
      });

    expect(() => toolRoute(userGuard)).toThrow(/getThings \(get \/things\) takes no access token: its guards accept cookieAuth only/);

    // Positive controls: a guard that takes a token, and a public route, which asks for no proof at all.
    expect(toolRoute(actorGuard)).toMatchObject({ 'x-tool': { entity: 'attachment' } });
    expect(toolRoute(publicGuard)).toMatchObject({ 'x-tool': { entity: 'attachment' } });
  });
});
