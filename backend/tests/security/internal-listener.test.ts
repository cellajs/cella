import { once } from 'node:events';
import { request } from 'node:http';
import { connect } from 'node:net';
import type { ServerType } from '@hono/node-server';
import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { env, modeSecret } from '#/env';
import { overrideConfig } from '../fixtures';
import { expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';
import { paragraph, seedAttachment } from './yjs-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Headers = Record<string, string>;

const portOf = (server: ServerType) => {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
};

/** An upgrade with the request target sent exactly as given (a URL-based client normalizes dot segments); resolves the status. */
function upgradeStatus(port: number, target: string, headers: Headers): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('upgrade timeout')));
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1');
      if (!response.includes('\r\n')) return;
      socket.destroy();
      resolve(Number(response.split('\r\n')[0].split(' ')[1]));
    });
    const lines = [
      `GET ${target} HTTP/1.1`,
      `Host: 127.0.0.1:${port}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    ];
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
  });
}

/** A JSON POST with the request target sent exactly as given; resolves the status and the parsed body, if any. */
function post(port: number, target: string, body: unknown, headers: Headers): Promise<{ status: number; body?: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: 'POST', path: target, headers: { 'content-type': 'application/json', ...headers } },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

/**
 * An upgrade as the listener's server emits it, from a peer address no test socket can have; the handler answers a
 * refusal on the socket at once, so the status line is read back synchronously.
 */
function emittedUpgradeStatus(server: ServerType, remoteAddress: string, headers: Headers): number {
  let statusLine = '';
  const socket = {
    write: (data: string) => {
      statusLine = data;
    },
    destroy: () => {},
  };
  server.emit('upgrade', { url: '/internal/cdc', headers, socket: { remoteAddress } }, socket, Buffer.alloc(0));
  return Number(statusLine.split(' ')[1]);
}

/**
 * Server-to-server routes live on their own listener, which the infra routes only from the private network: the CDC
 * worker's socket and the Yjs relay's materialize route. The public listener serves neither under any path, the
 * internal one admits private-network and loopback peers only, and each route still checks its own secret.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Internal listener', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const { internalApp, isCdcUpgradePath, serveApi, serveInternal } = await import('#/lib/listeners');
  const original = paragraph('original');
  let owner: TestTenant;
  let attachment: Awaited<ReturnType<typeof seedAttachment>>;
  let publicServer: ServerType;
  let internal: ReturnType<typeof serveInternal>;
  let publicPort: number;
  let internalPort: number;

  const materializeBody = (text: string) => ({
    entityType: 'attachment',
    entityId: attachment.id,
    tenantId: owner.tenantId,
    organizationId: owner.organization.id,
    editors: [owner.user.id],
    description: paragraph(text),
  });

  beforeAll(async () => {
    vi.unstubAllGlobals();
    owner = await createTestTenant(call, 'internal-listener');
    attachment = await seedAttachment({
      tenantId: owner.tenantId,
      organizationId: owner.organization.id,
      createdBy: owner.user.id,
      description: original,
    });
    publicServer = serveApi({ fetch: baseApp.fetch, port: 0, hostname: '127.0.0.1' });
    internal = serveInternal({ port: 0, hostname: '127.0.0.1' });
    await Promise.all([once(publicServer, 'listening'), once(internal.server, 'listening')]);
    publicPort = portOf(publicServer);
    internalPort = portOf(internal.server);
  });

  afterAll(async () => {
    internal.close();
    publicServer.close();
    await attachment.remove();
    await clearSecurityTestData();
  });

  it('must not reach the CDC socket via the public listener, under any path encoding', async () => {
    for (const target of ['/internal/cdc', '/api/%2e%2e/internal/cdc', '/api/../internal/cdc', '/api/internal/cdc']) {
      expect(await upgradeStatus(publicPort, target, { 'x-cdc-secret': modeSecret('CDC_SECRET') }), target).toBe(404);
    }
  });

  it('must not write a document via the public listener, under any path', async () => {
    for (const target of [
      '/internal/yjs/materialize',
      '/api/internal/yjs/materialize',
      '/api/%2e%2e/internal/yjs/materialize',
      '/yjs/materialize',
      '/api/yjs/materialize',
    ]) {
      const answer = await post(publicPort, target, materializeBody('via the public listener'), {
        'x-yjs-relay-secret': modeSecret('YJS_RELAY_SECRET'),
        Origin: appConfig.frontendUrl,
      });
      await expectRefusal(answer, 404, 'route_not_found', target);
    }
    expect((await attachment.read())?.description).toBe(original);
  });

  it('matches the CDC upgrade path on the raw request target exactly, query aside', () => {
    expect(isCdcUpgradePath('/internal/cdc')).toBe(true);
    expect(isCdcUpgradePath('/internal/cdc?attempt=2')).toBe(true);
    for (const target of [
      '/api/%2e%2e/internal/cdc',
      '/api/%2E%2E/internal/cdc',
      '/api/../internal/cdc',
      '/internal/./cdc',
      '/internal/cdc/',
      '/INTERNAL/CDC',
      'http://backend/internal/cdc',
      '',
      undefined,
    ]) {
      expect(isCdcUpgradePath(target), String(target)).toBe(false);
    }
  });

  it('must not reach the CDC socket on the internal listener via a dot-segment path', async () => {
    const secret = { 'x-cdc-secret': modeSecret('CDC_SECRET') };
    for (const target of ['/api/%2e%2e/internal/cdc', '/api/../internal/cdc', '/internal/./cdc']) {
      expect(await upgradeStatus(internalPort, target, secret), target).toBe(404);
    }
  });

  it('must not accept the CDC socket via an empty secret in a process that holds none', async () => {
    onTestFinished(overrideConfig(env, { CDC_SECRET: '' }));
    expect(await upgradeStatus(internalPort, '/internal/cdc', { 'x-cdc-secret': '' })).toBe(401);
    expect(await upgradeStatus(internalPort, '/internal/cdc', {})).toBe(401);
  });

  it('must not accept the CDC socket on the internal listener without its own secret', async () => {
    const attempts: Headers[] = [{}, { 'x-cdc-secret': `${modeSecret('CDC_SECRET')}x` }, { 'x-cdc-secret': modeSecret('YJS_RELAY_SECRET') }];
    for (const headers of attempts) {
      expect(await upgradeStatus(internalPort, '/internal/cdc', headers), JSON.stringify(headers)).toBe(401);
    }
  });

  it('must not write a document on the internal listener without the relay secret', async () => {
    const attempts: Headers[] = [
      {},
      { 'x-yjs-relay-secret': `${modeSecret('YJS_RELAY_SECRET')}x` },
      { 'x-yjs-relay-secret': modeSecret('CDC_SECRET') },
    ];
    for (const headers of attempts) {
      const { status } = await post(internalPort, '/internal/yjs/materialize', materializeBody('forged'), headers);
      expect(status, JSON.stringify(headers)).toBe(401);
    }
    expect((await attachment.read())?.description).toBe(original);
  });

  it('must not serve a peer outside the private network on any route of the internal listener, secret or not', async () => {
    // The peer address is read from the socket alone; a test cannot connect from a public one, so it is injected there.
    const publicPeer = { incoming: { socket: { remoteAddress: '203.0.113.9' } } } as never;
    const materialize = await internalApp.request(
      '/internal/yjs/materialize',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-yjs-relay-secret': modeSecret('YJS_RELAY_SECRET') },
        body: JSON.stringify(materializeBody('from a public address')),
      },
      publicPeer,
    );
    expect(materialize.status).toBe(403);
    expect((await internalApp.request('/health', {}, publicPeer)).status).toBe(403);
    const upgrade = emittedUpgradeStatus(internal.server, '203.0.113.9', { 'x-cdc-secret': modeSecret('CDC_SECRET') });
    expect(upgrade).toBe(403);
    // The peer is refused before its secret is read, so a public peer cannot tell a wrong secret from a right one.
    const withoutSecret = await internalApp.request('/internal/yjs/materialize', { method: 'POST' }, publicPeer);
    expect(withoutSecret.status).toBe(403);
    expect(emittedUpgradeStatus(internal.server, '203.0.113.9', {})).toBe(403);
    expect((await attachment.read())?.description).toBe(original);
  });

  it('answers the health path the internal load balancer pool probes, or the pool takes every backend out', async () => {
    // The pool expects the backend's `healthExpectStatus` (infra/config/services.config.ts).
    const response = await fetch(`http://127.0.0.1:${internalPort}/health`);
    expect(response.status).toBe(204);
  });

  it('accepts the CDC worker and the relay on the internal listener with their own secrets (positive control)', async () => {
    expect(await upgradeStatus(internalPort, '/internal/cdc', { 'x-cdc-secret': modeSecret('CDC_SECRET') })).toBe(101);

    const { status } = await post(internalPort, '/internal/yjs/materialize', materializeBody('written by the relay'), {
      'x-yjs-relay-secret': modeSecret('YJS_RELAY_SECRET'),
    });
    expect(status).toBe(200);
    expect((await attachment.read())?.description).toContain('written by the relay');
  });
});
