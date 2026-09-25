import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { MissingAncestorError } from 'shared';
import type { WebSocket, WebSocketServer } from 'ws';
import { type SocketContext, YJS_PENDING_QUEUE_CAP } from '../constants';
import { authorizeDoc } from '../data/permissions';
import { log } from '../lib/pino';
import { createSerialQueue } from '../lib/serial-queue';
import { handleMessage, peekMessageType, YMessage } from '../sync/relay';
import { joinCollab, leaveCollab } from '../sync/session-manager';
import { verifyToken } from './auth';
import { stripYjsPrefix } from './path-prefix';
import { checkConnectionRate } from './rate-limiter';

const statusText = {
  400: 'Bad Request',
  403: 'Forbidden',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
} as const;

/**
 * Rejects at the HTTP level for malformed requests (400), a token for another document (403) and rate limits (429),
 * then destroys the socket once the answer is flushed, as `ws` does for its own refusals: a peer that never closes
 * cannot hold it open. A browser cannot read the body or code of a failed upgrade and sees close 1006, so anything
 * the client must react to (an expired token) closes after the handshake.
 */
function rejectUpgrade(socket: Duplex, status: keyof typeof statusText, code: number, reason: string): void {
  if (socket.destroyed) return;
  const body = JSON.stringify({ code, reason });
  socket.once('finish', () => socket.destroy());
  socket.end(
    `HTTP/1.1 ${status} ${statusText[status]}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

/** Per-socket verification, awaited as the first task of the socket's queue so no sync frame runs before it settles. */
const verifications = new WeakMap<WebSocket, Promise<void>>();

/** `type:id` of the document a socket asks for, for log lines. */
const docLabel = (ctx: SocketContext) => `${ctx.requested.entityType}:${ctx.requested.entityId}`;

/** Authorizes the socket's user against the entity row after the connection is established, locally through the shared permission engine; on success the socket takes the row's scope, on failure it is disconnected and its queued sync frames never run. */
async function verifyEntityAsync(ws: WebSocket, ctx: SocketContext): Promise<void> {
  try {
    const scope = await authorizeDoc(ctx.userId, ctx.requested);
    if (ws.readyState !== ws.OPEN) return;
    if (!scope) {
      log.warn(`Entity access denied for ${docLabel(ctx)}`);
      ws.close(4003, 'Access denied');
      return;
    }
    ctx.scope = scope;
    log.debug(`Entity verified for ${docLabel(ctx)}`, { userId: ctx.userId });
  } catch (err) {
    if (ws.readyState !== ws.OPEN) return;
    if (err instanceof MissingAncestorError) {
      log.warn(`Entity missing required ancestor for ${docLabel(ctx)}`, {
        missingChannel: err.missingChannel,
        missingKey: err.missingKey,
      });
      ws.close(4400, 'Missing entity ancestor');
      return;
    }
    log.error(`Entity verify failed for ${docLabel(ctx)}`, { err: err });
    ws.close(4503, 'Authorization unavailable');
  }
}

/** Parses the request target; the Host header plays no part, so only the path and query decide. Null when no URL can hold it. */
function parseTarget(req: IncomingMessage): URL | null {
  try {
    // Accepts both '/<entityId>' and '/yjs/<entityId>': the load balancer does not strip the prefix on the path-routed app origin.
    return new URL(stripYjsPrefix(req.url ?? '/'), 'http://relay.invalid');
  } catch {
    return null;
  }
}

/**
 * Validates params and token, then accepts the connection until the token expires; entity-level access is verified
 * asynchronously while sync frames wait in the socket's queue and the socket stays outside the document.
 * Until `ws` takes the socket over, nothing else listens for its errors: a peer resetting the connection mid-handshake
 * would raise an uncaught 'error' and end the process, which under singleVM is the whole API. So the handler's own
 * listener destroys the socket, and a failure anywhere in the handler answers and ends the connection.
 */
export function setupUpgradeHandler(
  server: WebSocketServer,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (req, socket, head) => {
    const onSocketError = () => socket.destroy();
    socket.on('error', onSocketError);
    let handedOver = false;
    const handOver = (onOpen: (ws: WebSocket) => void) => {
      if (socket.destroyed) return;
      handedOver = true;
      // `ws` listens for the socket's errors from here on.
      socket.off('error', onSocketError);
      server.handleUpgrade(req, socket, head, onOpen);
    };
    admitUpgrade(server, req, socket, handOver).catch((err) => {
      log.error('WS upgrade failed', { err });
      if (handedOver) socket.destroy();
      else rejectUpgrade(socket, 500, 4500, 'Upgrade failed');
    });
  };
}

/** The upgrade's checks in order; every refusal ends the connection, and an accepted socket goes to `handOver`. */
async function admitUpgrade(
  server: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  handOver: (onOpen: (ws: WebSocket) => void) => void,
): Promise<void> {
  const url = parseTarget(req);
  if (!url) {
    log.warn('WS upgrade with a malformed request target');
    rejectUpgrade(socket, 400, 4400, 'Malformed request');
    return;
  }
  const token = url.searchParams.get('token');
  const rawEntityType = url.searchParams.get('entityType');
  const tenantId = url.searchParams.get('tenantId');

  if (!token || !rawEntityType || !tenantId) {
    log.warn('WS upgrade missing params', { hasToken: !!token, entityType: rawEntityType, hasTenantId: !!tenantId });
    rejectUpgrade(socket, 400, 4400, 'Missing params');
    return;
  }

  const result = verifyToken(token);
  if (!result.ok) {
    // Expiry is routine on a long-lived editor socket, so it logs at debug; a bad signature points at a mismatched key pair or tampering and warns.
    if (result.reason === 'expired') {
      log.debug('WS token expired', { entityType: rawEntityType });
    } else {
      log.warn('WS token verification failed', { entityType: rawEntityType, reason: result.reason });
    }
    // Closed after the handshake so the browser sees 4001, refreshes its token and reconnects; y-websocket 3 counts every closed connection towards its backoff, so no tight loop.
    handOver((ws) => ws.close(4001, 'Invalid or expired token'));
    return;
  }
  const payload = result.payload;

  if (payload.entityType !== rawEntityType) {
    log.warn('Token entityType mismatch', { tokenType: payload.entityType, requestedType: rawEntityType });
    rejectUpgrade(socket, 403, 4003, 'Token not valid for this entity type');
    return;
  }

  if (payload.tenantId !== tenantId) {
    log.warn('Token tenantId mismatch', { tokenTenant: payload.tenantId, requestedTenant: tenantId });
    rejectUpgrade(socket, 403, 4003, 'Token not valid for this tenant');
    return;
  }

  const entityId = url.pathname.replace(/^\/+/, '') || undefined;

  if (!entityId) {
    rejectUpgrade(socket, 400, 4400, 'Missing entityId');
    return;
  }

  // A token names one document: it opens no other.
  if (payload.entityId !== entityId) {
    log.warn('Token entityId mismatch', { tokenEntity: payload.entityId, requestedEntity: entityId });
    rejectUpgrade(socket, 403, 4003, 'Token not valid for this entity');
    return;
  }

  const allowed = await checkConnectionRate(payload.userId);
  if (!allowed) {
    rejectUpgrade(socket, 429, 4429, 'Too many connections');
    return;
  }

  // Accepted optimistically: sync frames queue on the socket until entity access is verified.
  const ctx: SocketContext = {
    userId: payload.userId,
    requested: {
      entityType: payload.entityType,
      entityId: payload.entityId,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    },
    scope: null,
  };

  // A peer that reset the connection while the limiter answered is already gone.
  if (socket.destroyed) return;
  log.info(`Connection accepted for ${docLabel(ctx)}`, { userId: ctx.userId, tenantId: payload.tenantId });
  handOver((ws) => {
    verifications.set(ws, verifyEntityAsync(ws, ctx));
    // The socket lives no longer than its token: the client reconnects with a fresh one, which a user whose access was revoked cannot get.
    const deadline = setTimeout(
      () => {
        if (ws.readyState === ws.OPEN) ws.close(4001, 'Token expired');
      },
      Math.max(0, payload.exp - Date.now()),
    );
    ws.once('close', () => clearTimeout(deadline));
    server.emit('connection', ws, ctx);
  });
}

/**
 * Sync frames from one socket run one at a time in arrival order through a serial queue whose
 * first task awaits the socket's entity verification and then joins the document: nothing is
 * applied, and no peer frame is received, before access is known, and a burst of keystrokes can
 * never interleave. Awareness bypasses the queue and is relayed only for a joined socket; the
 * latest frame sent before the join waits for it, so a new editor's presence shows at once.
 * Closing drops whatever has not started.
 */
export function setupConnectionHandler(server: WebSocketServer): void {
  server.on('connection', (ws, ctx: SocketContext) => {
    let joined: SocketContext['scope'] = null;
    let heldAwareness: Uint8Array | null = null;
    const relayAwareness = (data: Uint8Array) => {
      handleMessage(ctx, ws, data).catch((err) => {
        log.error(`Error handling awareness for ${docLabel(ctx)}`, { err });
      });
    };

    const queue = createSerialQueue((err) => {
      log.error(`Error handling message for ${docLabel(ctx)}`, { err });
    });
    const verification = verifications.get(ws);
    void queue.enqueue(async () => {
      if (verification) await verification;
      const held = heldAwareness;
      heldAwareness = null;
      // Denied, failed or closed during verification: queued frames must never apply, and the socket never joins.
      if (!ctx.scope || queue.closed || ws.readyState !== ws.OPEN) {
        queue.close();
        return;
      }
      joinCollab(ctx.scope, ws);
      joined = ctx.scope;
      if (held) relayAwareness(held);
    });

    const cleanup = () => {
      queue.close();
      heldAwareness = null;
      if (!joined) return;
      const scope = joined;
      joined = null;
      leaveCollab(scope, ws);
    };

    ws.on('message', (rawData: Buffer) => {
      // ws still emits frames that arrive while the socket closes: none reach the document or its peers.
      if (ws.readyState !== ws.OPEN) return;
      const data = new Uint8Array(rawData);
      if (peekMessageType(data) === YMessage.Awareness) {
        if (joined) relayAwareness(data);
        else if (!queue.closed) heldAwareness = data;
        return;
      }
      // Bounds memory while a slow verification holds the queue; a verified socket is not capped.
      if (!ctx.scope && queue.size >= YJS_PENDING_QUEUE_CAP) return;
      void queue.enqueue(() => handleMessage(ctx, ws, data));
    });

    ws.on('close', cleanup);

    ws.on('error', (err) => {
      log.error('WebSocket error', { entityType: ctx.requested.entityType, entityId: ctx.requested.entityId, err });
      cleanup();
    });
  });
}
