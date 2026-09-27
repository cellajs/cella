import { type IncomingMessage, STATUS_CODES } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Env } from '#/core/context';
import { cdcSecretRefusal, cdcWebSocketServer } from '#/lib/cdc-websocket';
import { appErrorHandler } from '#/lib/error';
import { healthApp } from '#/lib/health';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { yjsInternalHandlers } from '#/modules/yjs/yjs-internal-handlers';
import { isPublicIp } from '#/utils/ip-subnet';
import { log } from '#/utils/logger';

type FetchHandler = (request: Request) => Response | Promise<Response>;

interface ListenOptions {
  port: number;
  /** Defaults to every interface; tests bind loopback. */
  hostname?: string;
}

/**
 * The public listener: the API routes and nothing else. No upgrade handler is attached, so an upgrade request is
 * answered like any other request, and `/internal/*` answers 404 whatever the path's encoding.
 * @param fetch - The API app's fetch handler.
 * @param options - Port and optional hostname.
 * @param onListening - Called once the port is bound.
 * @returns The HTTP server.
 */
export function serveApi(
  { fetch, port, hostname = '0.0.0.0' }: ListenOptions & { fetch: FetchHandler },
  onListening?: (info: AddressInfo) => void,
): ServerType {
  const server = serve(
    { fetch, hostname, port, serverOptions: { keepAlive: true, keepAliveTimeout: 30_000 } },
    onListening,
  );
  if ('headersTimeout' in server) {
    server.headersTimeout = 60_000;
    server.requestTimeout = 30_000;
  }
  return server;
}

/**
 * Why a peer may not use the internal listener, or undefined. Its routes serve the app's own workers, which reach it
 * over the private network or loopback, so a public address is refused before any route reads its secret: a port a
 * deploy exposes by mistake still answers only its own network. Forwarding headers are not read; a proxy in front of
 * the listener is a peer like any other.
 * @param remoteAddress - The peer's address as its socket reports it.
 * @returns The reason, or undefined for an admitted peer.
 */
export function internalSourceRefusal(remoteAddress: string | undefined): string | undefined {
  if (!remoteAddress) return 'no peer address';
  return isPublicIp(remoteAddress) ? 'public address' : undefined;
}

/**
 * The internal listener's routes: the health path the internal load balancer pool probes, and the Yjs relay's routes.
 * Every request passes {@link internalSourceRefusal} first; the CDC worker's socket is accepted by the upgrade handler
 * {@link serveInternal} attaches, under the same policy.
 */
export const internalApp = new Hono<Env>();
internalApp.use('*', async (ctx, next) => {
  const peer = ctx.env.incoming.socket.remoteAddress;
  const refusal = internalSourceRefusal(peer);
  if (!refusal) return next();
  log.warn('Internal listener refused a request', { ip: peer, reason: refusal });
  return ctx.body(null, 403);
});
internalApp.use('*', dynamicBodyLimit);
internalApp.route('/', healthApp);
internalApp.route('/internal/yjs', yjsInternalHandlers);
internalApp.onError(appErrorHandler);

const cdcPath = '/internal/cdc';

/**
 * Whether an upgrade targets the CDC socket, by its raw request target up to the query string. A WHATWG-normalized
 * pathname would also match `/api/../internal/cdc` and `/api/%2e%2e/internal/cdc`, so a prefix-routing proxy in front
 * of the listener could alias another route to the socket.
 * @param rawUrl - The request target as received.
 * @returns Whether it is the socket's path.
 */
export function isCdcUpgradePath(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  const queryStart = rawUrl.indexOf('?');
  return (queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart)) === cdcPath;
}

/** Answers a refused upgrade with a bare status line and ends the socket. */
function refuseUpgrade(socket: Duplex, status: 401 | 403 | 404): void {
  socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n\r\n`);
  socket.destroy();
}

/**
 * The internal listener: server-to-server routes on their own port, which the infra routes only from the private
 * network (the internal load balancer pool, or loopback for co-hosted workers). The listener admits private-network
 * and loopback peers only, and each route still checks its own shared secret.
 * @param options - Port and optional hostname.
 * @param onListening - Called once the port is bound.
 * @returns The HTTP server and a close that also ends the CDC socket.
 */
export function serveInternal(
  { port, hostname = '0.0.0.0' }: ListenOptions,
  onListening?: (info: AddressInfo) => void,
): { server: ServerType; close: () => void } {
  const server = serve({ fetch: internalApp.fetch, hostname, port }, onListening);
  // An upgrade is the CDC worker's, or nothing: the exact raw path, the source policy, then the worker's own secret.
  // ServerType is broader than the HTTP/1 server that emits 'upgrade'.
  (server as NodeJS.EventEmitter).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const peer = request.socket.remoteAddress;
    if (!isCdcUpgradePath(request.url)) return refuseUpgrade(socket, 404);
    const sourceRefusal = internalSourceRefusal(peer);
    if (sourceRefusal) {
      log.warn('Internal listener refused an upgrade', { ip: peer, reason: sourceRefusal });
      return refuseUpgrade(socket, 403);
    }
    const secretRefusal = cdcSecretRefusal(request.headers['x-cdc-secret']);
    if (secretRefusal) {
      log.warn('CDC WebSocket auth failed', { ip: peer, reason: secretRefusal });
      return refuseUpgrade(socket, 401);
    }
    cdcWebSocketServer.accept(request, socket, head);
  });
  return {
    server,
    close: () => {
      cdcWebSocketServer.close();
      server.close();
    },
  };
}
