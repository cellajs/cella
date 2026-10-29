import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { accessScopes } from 'shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startAuthorization, startTestOauthServer, type TestOauthServer } from '../oauth-helpers';

const REDIRECT_URI = 'http://localhost:9999/callback';
const specialUseRefusal = 'hostname resolves to a special-use IP address';

/** The messages down an error's cause chain, outermost first. */
const causes = (error: unknown): string[] => (error instanceof Error ? [error.message, ...causes(error.cause)] : []);

/** A plain http listener on 127.0.0.1, as an internal service runs, that answers every path with a valid metadata document. */
async function startInternalService() {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? '');
    const document = {
      client_id: `https://${req.headers.host}${req.url}`,
      client_name: 'Internal service',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(document));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Listener has no port');
  return {
    origin: `https://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * A client id the authorization server has not seen may be the URL of a metadata document it fetches, so a request can
 * make the server send a request of its own to an address the requester picks. The provider's dispatcher checks the
 * address of each socket it opens and refuses a special-use one before any HTTP request leaves.
 */
describe('client metadata document fetch to an internal address', () => {
  let oauth: TestOauthServer;
  const refusals: unknown[] = [];

  beforeAll(async () => {
    oauth = await startTestOauthServer();
    oauth.provider.on('authorization.error', (_ctx, err) => refusals.push(err));
    // The provider fetches documents over https only and the listener speaks http: the scheme changes, and the
    // provider's dispatcher, which checks the peer, stays on the request.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      realFetch(typeof input === 'string' ? input.replace(/^https:\/\/127\.0\.0\.1:/, 'http://127.0.0.1:') : input, init),
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await oauth.close();
  });

  const authorize = (clientId: string) => startAuthorization(oauth.issuer, { clientId, redirectUri: REDIRECT_URI, scope: accessScopes.all[0] });

  it('must refuse a client_id metadata document on a private address', async () => {
    const service = await startInternalService();
    try {
      const { status } = await authorize(`${service.origin}/private`);

      expect(status).toBe(400);
      expect(causes(refusals.at(-1)).at(-1)).toBe(specialUseRefusal);
      expect(service.requests).toEqual([]);
    } finally {
      await service.close();
    }
  });

  it('fetches a client_id metadata document on a public address', async () => {
    const service = await startInternalService();
    // No public address answers in a test: the listener's socket reports one as its peer.
    const reportPublicPeer = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('socket' in message) || !(message.socket instanceof Socket)) return;
      if (message.socket.remotePort === service.port) Object.defineProperty(message.socket, 'remoteAddress', { value: '1.1.1.1' });
    };
    subscribe('undici:client:connected', reportPublicPeer);
    try {
      const { status, uid } = await authorize(`${service.origin}/public`);

      expect(status).toBe(303);
      expect(uid).toBeTruthy();
      expect(service.requests).toEqual(['/public']);
    } finally {
      unsubscribe('undici:client:connected', reportPublicPeer);
      await service.close();
    }
  });
});
