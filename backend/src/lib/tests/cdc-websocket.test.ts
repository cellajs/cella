import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import type { ServerType } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cdcWebSocketServer, isCdcUpgradePath } from '#/lib/cdc-websocket';

const secret = 'test-cdc-secret-min16chars';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  cdcWebSocketServer.attachToServer(server as unknown as ServerType);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  cdcWebSocketServer.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * Sends a WebSocket upgrade with the request target exactly as given (a URL-based client would normalize dot
 * segments before sending) and resolves with the response status code.
 */
function upgradeStatus(target: string, headers: Record<string, string> = { 'x-cdc-secret': secret }): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let response = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('upgrade timeout')));
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1');
      const statusLine = response.split('\r\n')[0];
      if (!statusLine || !response.includes('\r\n')) return;
      socket.destroy();
      resolve(Number(statusLine.split(' ')[1]));
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

describe('CDC upgrade path', () => {
  it('matches the raw request path exactly, query aside', () => {
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

  it('must not reach the CDC endpoint via a dot-segment path through the public /api route', async () => {
    for (const target of ['/api/%2e%2e/internal/cdc', '/api/../internal/cdc', '/internal/./cdc']) {
      expect(await upgradeStatus(target), target).toBe(404);
    }
  });

  it('must not accept an upgrade without the secret or with a wrong one', async () => {
    expect(await upgradeStatus('/internal/cdc', {})).toBe(401);
    expect(await upgradeStatus('/internal/cdc', { 'x-cdc-secret': `${secret}x` })).toBe(401);
  });

  it('accepts the worker on the exact path with the secret (positive control)', async () => {
    expect(await upgradeStatus('/internal/cdc')).toBe(101);
  });
});
