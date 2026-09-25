import { once } from 'node:events';
import { request } from 'node:http';
import { connect } from 'node:net';
import type { ServerType } from '@hono/node-server';
import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
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

/** A JSON POST with the request target sent exactly as given; resolves the status and the error type, if any. */
function post(
  port: number,
  target: string,
  body: unknown,
  headers: Headers,
): Promise<{ status: number; type?: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: target,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let type: string | undefined;
          try {
            type = (JSON.parse(text) as { type?: string }).type;
          } catch {}
          resolve({ status: res.statusCode ?? 0, type });
        });
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

/**
 * Server-to-server routes live on their own listener, which the infra routes only from the private network: the CDC
 * worker's socket and the Yjs relay's materialize route. The public listener serves neither under any path, so a
 * leaked or guessed secret is useless from outside, and each route still checks its own secret.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Internal listener', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  const { serveApi, serveInternal } = await import('#/lib/listeners');
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
      expect(await upgradeStatus(publicPort, target, { 'x-cdc-secret': env.CDC_SECRET }), target).toBe(404);
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
      const { status, type } = await post(publicPort, target, materializeBody('via the public listener'), {
        'x-yjs-relay-secret': env.YJS_RELAY_SECRET,
        Origin: appConfig.frontendUrl,
      });
      expect(status, target).toBe(404);
      expect(type, target).toBe('route_not_found');
    }
    expect((await attachment.read())?.description).toBe(original);
  });

  it('must not accept the CDC socket on the internal listener without its own secret', async () => {
    const attempts: Headers[] = [
      {},
      { 'x-cdc-secret': `${env.CDC_SECRET}x` },
      { 'x-cdc-secret': env.YJS_RELAY_SECRET },
    ];
    for (const headers of attempts) {
      expect(await upgradeStatus(internalPort, '/internal/cdc', headers), JSON.stringify(headers)).toBe(401);
    }
  });

  it('must not write a document on the internal listener without the relay secret', async () => {
    const attempts: Headers[] = [
      {},
      { 'x-yjs-relay-secret': `${env.YJS_RELAY_SECRET}x` },
      { 'x-yjs-relay-secret': env.CDC_SECRET },
    ];
    for (const headers of attempts) {
      const { status } = await post(internalPort, '/internal/yjs/materialize', materializeBody('forged'), headers);
      expect(status, JSON.stringify(headers)).toBe(401);
    }
    expect((await attachment.read())?.description).toBe(original);
  });

  it('accepts the CDC worker and the relay on the internal listener with their own secrets (positive control)', async () => {
    expect(await upgradeStatus(internalPort, '/internal/cdc', { 'x-cdc-secret': env.CDC_SECRET })).toBe(101);

    const { status } = await post(internalPort, '/internal/yjs/materialize', materializeBody('written by the relay'), {
      'x-yjs-relay-secret': env.YJS_RELAY_SECRET,
    });
    expect(status).toBe(200);
    expect((await attachment.read())?.description).toContain('written by the relay');
  });
});
