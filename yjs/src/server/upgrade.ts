import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { MissingScopeError } from 'shared';
import type { WebSocket, WebSocketServer } from 'ws';
import type { DocContext } from '../constants';
import { canEditEntity } from '../data/permissions';
import { log } from '../lib/pino';
import { discardPendingBuffer, handleMessage, releaseBufferedMessages } from '../sync/relay';
import { joinCollab, leaveCollab } from '../sync/session-manager';
import { verifyToken } from './auth';
import { stripYjsPrefix } from './path-prefix';
import { checkConnectionRate } from './rate-limiter';

/** Rejects at the HTTP level for malformed requests, mismatched tokens and rate limits. A browser cannot read the body or code of a failed upgrade and sees close 1006, so anything the client must react to (an expired token) closes after the handshake. */
function rejectUpgrade(socket: Duplex, code: number, reason: string): void {
  if (socket.destroyed) return;
  const body = JSON.stringify({ code, reason });
  socket.end(
    `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

function applyVerifyResult(ws: WebSocket, ctx: DocContext, allowed: boolean): void {
  if (allowed) {
    ctx.verified = true;
    releaseBufferedMessages(ws);
    log.debug(`Entity verified for ${ctx.entityType}:${ctx.entityId}`, { userId: ctx.userId });
  } else {
    log.warn(`Entity access denied for ${ctx.entityType}:${ctx.entityId}`);
    discardPendingBuffer(ws);
    ws.close(4003, 'Access denied');
  }
}

/** Verifies entity access after the connection is established, locally through the shared permission engine; on failure the client is disconnected and queued writes are discarded. */
async function verifyEntityAsync(ws: WebSocket, ctx: DocContext): Promise<void> {
  try {
    const allowed = await canEditEntity(ctx);
    if (ws.readyState !== ws.OPEN) return;
    applyVerifyResult(ws, ctx, allowed);
  } catch (err) {
    if (ws.readyState !== ws.OPEN) return;
    discardPendingBuffer(ws);
    if (err instanceof MissingScopeError) {
      log.warn(`Entity missing required scope for ${ctx.entityType}:${ctx.entityId}`, {
        missingChannel: err.missingChannel,
        missingKey: err.missingKey,
      });
      ws.close(4400, 'Missing entity scope');
      return;
    }
    log.error(`Entity verify failed for ${ctx.entityType}:${ctx.entityId}`, { err: err });
    ws.close(4503, 'Authorization unavailable');
  }
}

/** Validates params and token, then accepts the connection; entity-level access is verified asynchronously while sync messages buffer. */
export function setupUpgradeHandler(
  server: WebSocketServer,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return async (req, socket, head) => {
    // Accepts both '/<entityId>' and '/yjs/<entityId>': the load balancer does not strip the prefix on the path-routed app origin.
    const url = new URL(stripYjsPrefix(req.url ?? '/'), `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const rawEntityType = url.searchParams.get('entityType');
    const tenantId = url.searchParams.get('tenantId');

    if (!token || !rawEntityType || !tenantId) {
      log.warn('WS upgrade missing params', { hasToken: !!token, entityType: rawEntityType, hasTenantId: !!tenantId });
      rejectUpgrade(socket, 4400, 'Missing params');
      return;
    }

    const result = verifyToken(token);
    if (!result.ok) {
      // Expiry is routine on a long-lived editor socket with a 30-minute token, so it logs at debug; a bad signature points at YJS_SECRET drift or tampering and warns.
      if (result.reason === 'expired') {
        log.debug('WS token expired', { entityType: rawEntityType });
      } else {
        log.warn('WS token verification failed', { entityType: rawEntityType, reason: result.reason });
      }
      // Closed after the handshake so the browser sees 4001, refreshes its token and reconnects; y-websocket 3 counts every closed connection towards its backoff, so no tight loop.
      if (socket.destroyed) return;
      server.handleUpgrade(req, socket, head, (ws) => ws.close(4001, 'Invalid or expired token'));
      return;
    }
    const payload = result.payload;

    if (payload.entityType !== rawEntityType) {
      log.warn('Token entityType mismatch', { tokenType: payload.entityType, requestedType: rawEntityType });
      rejectUpgrade(socket, 4003, 'Token not valid for this entity type');
      return;
    }

    if (payload.tenantId !== tenantId) {
      log.warn('Token tenantId mismatch', { tokenTenant: payload.tenantId, requestedTenant: tenantId });
      rejectUpgrade(socket, 4003, 'Token not valid for this tenant');
      return;
    }

    const allowed = await checkConnectionRate(payload.userId);
    if (!allowed) {
      rejectUpgrade(socket, 4429, 'Too many connections');
      return;
    }

    const entityId = url.pathname.replace(/^\/+/, '') || undefined;

    if (!entityId) {
      rejectUpgrade(socket, 4400, 'Missing entityId');
      return;
    }

    if (socket.destroyed) return;

    // Accepted optimistically: sync messages buffer until entity access is verified.
    const ctx: DocContext = {
      entityType: rawEntityType,
      entityId,
      tenantId: payload.tenantId,
      userId: payload.userId,
      organizationId: payload.organizationId,
      verified: false,
    };

    log.info(`Connection accepted for ${rawEntityType}:${entityId}`, { userId: ctx.userId, tenantId: ctx.tenantId });
    server.handleUpgrade(req, socket, head, (ws) => {
      server.emit('connection', ws, ctx);
      verifyEntityAsync(ws, ctx);
    });
  };
}

export function setupConnectionHandler(server: WebSocketServer): void {
  server.on('connection', (ws, ctx: DocContext) => {
    joinCollab(ctx, ws);

    const cleanup = () => {
      discardPendingBuffer(ws);
      leaveCollab(ctx.entityType, ctx.entityId, ws);
    };

    ws.on('message', async (rawData: Buffer) => {
      const data = new Uint8Array(rawData);
      try {
        await handleMessage(ctx, ws, data);
      } catch (err) {
        log.error(`Error handling message for ${ctx.entityType}:${ctx.entityId}`, { err: err });
      }
    });

    ws.on('close', cleanup);

    ws.on('error', (err) => {
      log.error('WebSocket error', { entityType: ctx.entityType, entityId: ctx.entityId, err });
      cleanup();
    });
  });
}
