import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
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
});
