import { once } from 'node:events';
import { type IncomingMessage, request } from 'node:http';
import { json } from 'node:stream/consumers';
import type { ServerType } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveApi } from '#/lib/listeners';
import { createBaseApp } from '#/server';

const prefixes = ['', '/api', '/mcp'];

/**
 * The load balancer forwards a same-origin request with its `/api` or `/mcp` prefix on, and the app strips it before
 * routing. The requests go over a real socket: the node server's own request object, which the strip has to rebuild,
 * exists only behind a listener, so `app.request()` never meets it.
 */
describe('Prefix mounts', () => {
  let server: ServerType;
  let origin: string;

  beforeAll(async () => {
    vi.unstubAllGlobals();
    const app = createBaseApp();
    app.all('/probe/:name', async (ctx) =>
      ctx.json({
        method: ctx.req.method,
        name: ctx.req.param('name'),
        query: ctx.req.query('q'),
        marker: ctx.req.header('x-marker'),
        body: await ctx.req.text(),
      }),
    );
    server = serveApi({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await once(server, 'listening');
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(() => {
    server.close();
  });

  it.each(prefixes)('answers a read under "%s" from the route of the bare path, with its path, query and headers', async (prefix) => {
    const response = await fetch(`${origin}${prefix}/probe/a%20b?q=1`, { headers: { 'x-marker': 'kept' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ method: 'GET', name: 'a b', query: '1', marker: 'kept', body: '' });
  });

  it.each(prefixes)('hands a write under "%s" to its route with the body intact', async (prefix) => {
    const body = JSON.stringify({ text: 'written through the prefix' });
    const response = await fetch(`${origin}${prefix}/probe/write`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ method: 'POST', name: 'write', body });
  });

  it.each(prefixes.slice(1))('answers a path no route serves under "%s" as not found', async (prefix) => {
    const response = await fetch(`${origin}${prefix}/no-such-route`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ type: 'route_not_found' });
  });

  // 3,900 prefixes fit the node server's 16 KiB header limit and overflow the stack with a redispatch per prefix.
  it.each([
    { label: 'two prefixes', path: '/api/api/probe/a' },
    { label: 'an encoded second prefix', path: '/api/%61pi/probe/a' },
    { label: '3,900 prefixes', path: `${'/api'.repeat(3900)}/probe/a` },
  ])('must not redispatch once per repeated prefix ($label)', async ({ path }) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ type: 'route_not_found' });
  });

  // `fetch` refuses to send TRACE, so it goes out through `node:http`.
  it.each(prefixes.slice(1))('must not answer TRACE under "%s" with a server error', async (prefix) => {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      request(`${origin}${prefix}/probe/a`, { method: 'TRACE' }, resolve).on('error', reject).end();
    });
    expect(response.statusCode).toBe(404);
    expect(await json(response)).toMatchObject({ type: 'route_not_found' });
  });
});
