import type { AddressInfo } from 'node:net';
import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createHealthApp } from 'shared/health-app';
import type { Env } from '#/core/context';
import { env } from '#/env';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { appErrorHandler } from '#/lib/error';
import { getHealthResponse } from '#/lib/health';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { yjsInternalHandlers } from '#/modules/yjs/yjs-internal-handlers';

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
 * The internal listener's routes: the health path the internal load balancer pool probes, and the Yjs relay's routes.
 * The CDC worker's socket is accepted by the upgrade handler that {@link serveInternal} attaches.
 */
export const internalApp = new Hono<Env>();
internalApp.use('*', dynamicBodyLimit);
internalApp.route(
  '/',
  createHealthApp({
    version: env.RELEASE_SHA,
    full: async () => {
      const { response, httpStatus } = await getHealthResponse();
      return { httpStatus, body: { ...response, version: env.RELEASE_SHA } };
    },
  }),
);
internalApp.route('/internal/yjs', yjsInternalHandlers);
internalApp.onError(appErrorHandler);

/**
 * The internal listener: server-to-server routes on their own port, which the infra routes only from the private
 * network (the internal load balancer pool, or loopback for co-hosted workers). Each route still checks its own
 * shared secret.
 * @param options - Port and optional hostname.
 * @param onListening - Called once the port is bound.
 * @returns The HTTP server and a close that also ends the CDC socket.
 */
export function serveInternal(
  { port, hostname = '0.0.0.0' }: ListenOptions,
  onListening?: (info: AddressInfo) => void,
): { server: ServerType; close: () => void } {
  const server = serve({ fetch: internalApp.fetch, hostname, port }, onListening);
  cdcWebSocketServer.attachToServer(server);
  return {
    server,
    close: () => {
      cdcWebSocketServer.close();
      server.close();
    },
  };
}
