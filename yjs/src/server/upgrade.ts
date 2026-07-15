import { URL } from 'node:url';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { MissingScopeError } from 'shared';
import type { WebSocket, WebSocketServer } from 'ws';
import type { DocContext } from '../constants';
import { canEditEntity } from '../data/permissions';
import { log } from '../lib/pino';
import { verifyToken } from './auth';
import { stripYjsPrefix } from './path-prefix';
import { checkConnectionRate } from './rate-limiter';
import { joinCollab, leaveCollab } from '../sync/session-manager';
import { handleMessage, flushPendingBuffer, discardPendingBuffer } from '../sync/relay';

/**
 * Reject the upgrade at the HTTP level: no WebSocket handshake is completed.
 * Calling handleUpgrade + ws.close() instead would fire the client's `onopen`
 * (resetting its backoff counter) before `onclose`, causing a rapid ~100ms
 * retry loop with the same bad credentials.
 */
function rejectUpgrade(socket: Duplex, code: number, reason: string): void {
  if (socket.destroyed) return;
  const body = JSON.stringify({ code, reason });
  socket.end(
    `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

/** Apply the result of entity verification: flush buffered messages on success, discard and close on failure. */
function applyVerifyResult(ws: WebSocket, ctx: DocContext, allowed: boolean): void {
  if (allowed) {
    ctx.verified = true;
    flushPendingBuffer(ws);
    log.debug(`Entity verified for ${ctx.entityType}:${ctx.entityId}`, { userId: ctx.userId });
  } else {
    log.warn(`Entity access denied for ${ctx.entityType}:${ctx.entityId}`);
    discardPendingBuffer(ws);
    ws.close(4003, 'Access denied');
  }
}

/**
 * Verify entity access asynchronously after the WebSocket connection is established.
 * The authorization decision is computed locally by the shared permission engine, no backend
 * round-trip. If verification fails, the client is disconnected and queued writes are discarded.
 */
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

/**
 * Handle the HTTP→WS upgrade: validate params, verify token, accept connection optimistically.
 * Entity-level access is verified asynchronously: all sync messages are buffered until verified.
 */
export function setupUpgradeHandler(server: WebSocketServer): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return async (req, socket, head) => {
    // Same-origin migration: accept both '/<entityId>' (legacy subdomain
    // origin) and '/yjs/<entityId>' (path-routed app origin; the LB does not
    // strip the prefix).
    const url = new URL(stripYjsPrefix(req.url ?? '/'), `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const rawEntityType = url.searchParams.get('entityType');
    const tenantId = url.searchParams.get('tenantId');

    if (!token || !rawEntityType || !tenantId) {
      log.warn('WS upgrade missing params', { hasToken: !!token, entityType: rawEntityType, hasTenantId: !!tenantId });
      rejectUpgrade(socket, 4400, 'Missing params');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      log.warn('WS token verification failed', { entityType: rawEntityType });
      rejectUpgrade(socket, 4001, 'Invalid or expired token');
      return;
    }

    // Token must authorize editing this entity type
    if (payload.entityType !== rawEntityType) {
      log.warn('Token entityType mismatch', { tokenType: payload.entityType, requestedType: rawEntityType });
      rejectUpgrade(socket, 4003, 'Token not valid for this entity type');
      return;
    }

    // Token must be for the correct tenant
    if (payload.tenantId !== tenantId) {
      log.warn('Token tenantId mismatch', { tokenTenant: payload.tenantId, requestedTenant: tenantId });
      rejectUpgrade(socket, 4003, 'Token not valid for this tenant');
      return;
    }

    // Per-user connection rate limit
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

    // Accept the connection optimistically: all sync messages are buffered until entity access is verified
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
      // Start async entity verification: all sync messages are buffered until this completes
      verifyEntityAsync(ws, ctx);
    });
  };
}

/** 
 * Wire up connection event: join collab, handle messages, handle close/error.
 */
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
