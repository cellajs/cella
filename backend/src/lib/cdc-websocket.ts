import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ServerType } from '@hono/node-server';
import { z } from '@hono/zod-openapi';
import { isValidEventType } from 'shared';
import { type WebSocket, WebSocketServer } from 'ws';
import { env } from '#/env';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { productCache } from '#/middlewares/product-cache/app-product-cache';
import { activityActionSchema, activitySchema } from '#/modules/activities/activities-schema';
import { log } from '#/utils/logger';

/**
 * Validates the CDC worker payload with stricter activity fields required on this wire path.
 * Keep it synchronized with the producing `CdcOutboundMessage` type.
 * @see cdc/src/services/activity-service.ts
 */
const cdcMessageSchema = z.object({
  activity: z.object({
    ...activitySchema.shape,
    // Override nullable fields that are always present in CDC messages
    action: activityActionSchema,
    subjectId: z.string().nullable(),
    // seq: org-sequence position stamped by CDC worker (product entities only)
    seq: z.number().optional(),
    // Batch fields (set by CDC Worker for multi-entity transactions). Under the org
    // sequence a group's seq..batchUntilSeq range may interleave with other groups;
    // `count` is the authoritative row count.
    batchUntilSeq: z.number().optional(),
    count: z.number().optional(),
  }),
  rowData: z.record(z.string(), z.unknown()),
  // Old-row permission subset when the row's computed location path changed (move-out)
  movedFrom: z.record(z.string(), z.unknown()).nullable().optional(),
  // Per-row permission fields for batches: dispatch decides per subscriber across all rows
  batchRows: z
    .array(
      z.object({
        seq: z.number().optional(),
        rowData: z.record(z.string(), z.unknown()),
        movedFrom: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .optional(),
  _trace: z
    .object({
      traceId: z.string(),
      spanId: z.string(),
      cdcTimestamp: z.number(),
      lsn: z.string().optional(),
    })
    .optional(),
});

/** The validated CDC → API-server message shape. Counterpart of the CDC worker's `CdcOutboundMessage`. */
export type CdcMessage = z.infer<typeof cdcMessageSchema>;

/** Idle timeout in ms - close connection if no message received within this time */
const IDLE_TIMEOUT_MS = 90_000;

/** Ping interval in ms */
const PING_INTERVAL_MS = 30_000;

/** Strip an IPv4-mapped IPv6 prefix (e.g. `::ffff:10.0.0.9` → `10.0.0.9`). */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Loopback for co-located deploys (standalone Compose / single pod). */
function isLoopbackIp(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1';
}

/** Scaleway VPC subnet 10.0.0.0/24 (infra/modules/network.ts). */
function isVpcIp(ip: string): boolean {
  return /^10\.0\.0\.\d{1,3}$/.test(ip);
}

/**
 * Docker bridge private ranges (172.16.0.0/12, 192.168.0.0/16), the network
 * the per-VM Caddy `ingress` container runs on. The local ingress is the only
 * thing that can be the direct TCP peer when a request is proxied.
 */
function isDockerBridgeIp(ip: string): boolean {
  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ip) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip);
}

/**
 * Allows direct loopback/VPC CDC peers and VPC clients forwarded by the local ingress.
 * The ingress overwrites client-supplied forwarding headers, making its reported source
 * trustworthy. The mandatory shared secret remains the primary authentication layer.
 */
function isAllowedCdcSource(remoteIp: string | undefined, forwardedFor: string | string[] | undefined): boolean {
  if (!remoteIp) return false;
  const peer = normalizeIp(remoteIp);

  // Direct connection, no proxy in between (co-located Compose over loopback,
  // or a direct VPC dial): the peer IS the worker.
  if (isLoopbackIp(peer) || isVpcIp(peer)) return true;

  // Behind the per-VM ingress proxy: the direct peer is the local Caddy on the
  // Docker bridge. Trust X-Forwarded-For and validate the real client IP it
  // reports is a loopback/VPC address.
  if (isDockerBridgeIp(peer)) {
    const xff = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const client = normalizeIp(xff?.split(',')[0]?.trim() ?? '');
    return isLoopbackIp(client) || isVpcIp(client);
  }

  return false;
}

/** Self-reported CDC worker health payload pushed over the WS control channel. */
export interface CdcWorkerHealth {
  replicationStatus: string;
  lastLsn: string | null;
  messagesSent: number;
  /** Whether PostgreSQL reports the replication slot as active (real WAL data-plane signal). */
  slotActive?: boolean | null;
  /** WAL bytes between the current LSN and the slot's confirmed flush LSN. */
  lagBytes?: number | null;
  /** ISO timestamp of the last applied DML change. */
  lastEventAt?: string | null;
  /** Whether the worker is currently replaying backlogged WAL. */
  catchingUp?: boolean;
}

/**
 * Internal CDC worker channel. It requires the shared secret and an allowed source,
 * permits one live connection, and closes idle peers after 90 seconds.
 */
class CdcWebSocketServer {
  private wss: WebSocketServer | null = null;
  private currentConnection: WebSocket | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  // Health metrics
  private _cdcConnected = false;
  private _lastMessageAt: Date | null = null;
  private _messagesReceived = 0;
  private _parseErrors = 0;
  private _workerHealth: { payload: CdcWorkerHealth; receivedAt: Date } | null = null;

  /**
   * Attach WebSocket server to an existing HTTP server.
   * Handles upgrade requests to /internal/cdc with auth validation.
   */
  attachToServer(server: ServerType): void {
    this.wss = new WebSocketServer({ noServer: true });

    // Type assertion needed because ServerType is broader than HTTP1 Server
    (server as NodeJS.EventEmitter).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Only handle /internal/cdc path
      const url = new URL(request.url ?? '', `http://${request.headers.host}`);
      if (url.pathname !== '/internal/cdc') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Production accepts co-located loopback or VPC workers.
      // Behind the local ingress, the trusted forwarding header carries the worker IP.
      const remoteIp = request.socket.remoteAddress;
      if (env.NODE_ENV === 'production' && !isAllowedCdcSource(remoteIp, request.headers['x-forwarded-for'])) {
        log.warn('CDC WebSocket rejected disallowed source', {
          ip: remoteIp,
          forwardedFor: request.headers['x-forwarded-for'],
        });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Validate shared secret for every environment.
      const secret = request.headers['x-cdc-secret'];
      if (!env.CDC_SECRET || secret !== env.CDC_SECRET) {
        log.warn('CDC WebSocket auth failed', {
          ip: request.socket.remoteAddress,
          reason: !env.CDC_SECRET ? 'CDC_SECRET not configured' : 'invalid secret',
        });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    });

    log.info('CDC WebSocket server attached to HTTP server');
  }

  /**
   * Handle a new WebSocket connection from CDC Worker.
   * Replaces existing connection if one exists.
   */
  private handleConnection(ws: WebSocket): void {
    // Close existing connection if any (graceful replacement)
    if (this.currentConnection) {
      log.info('Replacing existing CDC Worker connection');
      this.currentConnection.close(1000, 'Replaced by new connection');
    }

    this.currentConnection = ws;
    this._cdcConnected = true;
    this.resetIdleTimer();
    this.startPingInterval();

    log.info('CDC Worker connected via WebSocket');

    ws.on('message', (data) => {
      this.resetIdleTimer();
      this.handleMessage(data.toString());
    });

    ws.on('pong', () => {
      this.resetIdleTimer();
    });

    ws.on('close', (code, reason) => {
      log.info('CDC Worker disconnected', { code, reason: reason.toString() });
      this.cleanup();
    });

    ws.on('error', (err) => {
      log.error('CDC WebSocket error', { err });
      this.cleanup();
    });
  }

  /**
   * Handle incoming message from CDC Worker.
   * Validates JSON schema and transforms message into ActivityBus event.
   */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      // Handle CDC control messages (e.g. catchup_complete) before schema validation
      if (parsed?._control) {
        this.handleControlMessage(parsed);
        return;
      }

      const result = cdcMessageSchema.safeParse(parsed);

      if (!result.success) {
        this._parseErrors++;
        // Extract what we can from the raw message for debugging
        const preview = {
          type: parsed?.activity?.type,
          subjectId: parsed?.activity?.subjectId,
          action: parsed?.activity?.action,
        };
        log.error('CDC message schema validation failed - message dropped', {
          errors: result.error.issues,
          preview,
        });
        return;
      }

      const message = result.data;
      this._messagesReceived++;
      this._lastMessageAt = new Date();

      // Validate event type is a known ActivityEventType
      const { type } = message.activity;
      if (!isValidEventType(type)) {
        this._parseErrors++;
        log.error('Unknown event type in CDC message - message dropped', {
          type,
          subjectId: message.activity.subjectId,
        });
        return;
      }

      // Keep the entity detail cache fresh on writes: invalidate each changed entity by id so a
      // later detail fetch re-enriches. Batch messages carry per-row ids in batchRows; single
      // messages carry subjectId. No cache token involved (entity-keyed cache).
      const entityType = message.activity.entityType;
      if (entityType) {
        if (message.batchRows?.length) {
          for (const row of message.batchRows) {
            const id = row.rowData.id;
            if (typeof id === 'string') productCache.invalidateProduct(entityType, id);
          }
        } else if (message.activity.subjectId) {
          productCache.invalidateProduct(entityType, message.activity.subjectId);
        }
      }

      // Transform CDC message to ActivityBus event and emit
      const activityEvent = {
        ...message.activity,
        type,
        rowData: message.rowData,
        movedFrom: message.movedFrom ?? null,
        batchRows: message.batchRows ?? null,
        seq: message.activity.seq ?? null,
        batchUntilSeq: message.activity.batchUntilSeq ?? null,
        count: message.activity.count ?? null,
        propagation: null,
        trace: message._trace ?? null,
      } as ActivityEvent;

      log.trace('CDC message processed', {
        type: message.activity.type,
        subjectId: message.activity.subjectId,
      });

      activityBus.emit(activityEvent);
    } catch (err) {
      this._parseErrors++;
      log.error('Failed to parse CDC message', { err });
    }
  }

  /**
   * Handle CDC control messages (not regular activity events).
   * These are sent by the CDC worker to signal lifecycle events like catchup completion.
   */
  private handleControlMessage(message: { _control: string; [key: string]: unknown }): void {
    if (message._control === 'catchup_complete') {
      const eventsProcessed = message.eventsProcessed ?? 0;
      const catchupDurationMs = message.catchupDurationMs ?? 0;

      // Clear entity caches after counter recalculation.
      productCache.clear();

      log.info('CDC catchup complete — entity caches cleared', {
        eventsProcessed,
        catchupDurationMs,
      });
      return;
    }

    if (message._control === 'health') {
      const payload = message.payload as CdcWorkerHealth | undefined;
      if (payload?.replicationStatus) {
        this._workerHealth = { payload, receivedAt: new Date() };
      }
      return;
    }

    log.warn('Unknown CDC control message', { control: message._control });
  }

  /**
   * Reset idle timer; connection closes when no activity arrives.
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      log.warn('CDC WebSocket idle timeout, closing connection');
      this.currentConnection?.close(1000, 'Idle timeout');
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Start sending periodic pings to keep connection alive.
   */
  private startPingInterval(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.currentConnection?.readyState === 1) {
        // WebSocket.OPEN
        this.currentConnection.ping();
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Clean up connection state.
   */
  private cleanup(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.currentConnection = null;
    this._cdcConnected = false;
    this._workerHealth = null;
  }

  /** Latest CDC worker self-report received over the WS control channel. */
  getWorkerHealth(): { payload: CdcWorkerHealth; receivedAt: Date } | null {
    return this._workerHealth;
  }

  /**
   * Get health status for the CDC WebSocket connection.
   */
  getHealthStatus(): {
    cdcConnected: boolean;
    lastMessageAt: string | null;
    messagesReceived: number;
    parseErrors: number;
    status: 'healthy' | 'degraded' | 'unknown';
  } {
    // Determine status based on connection and message timing
    let status: 'healthy' | 'degraded' | 'unknown' = 'unknown';

    if (this._cdcConnected) {
      // If connected and received message recently (within 60s), healthy
      const sixtySecondsAgo = Date.now() - 60_000;
      if (this._lastMessageAt && this._lastMessageAt.getTime() > sixtySecondsAgo) {
        status = 'healthy';
      } else if (this._lastMessageAt) {
        status = 'degraded'; // Connected but no recent messages
      } else {
        status = 'healthy'; // Just connected, no messages yet is OK
      }
    } else if (!env.NODB) {
      // CDC expected but not connected
      status = 'degraded';
    }
    // In NODB mode without CDC, status remains 'unknown' (not applicable)

    return {
      cdcConnected: this._cdcConnected,
      lastMessageAt: this._lastMessageAt?.toISOString() ?? null,
      messagesReceived: this._messagesReceived,
      parseErrors: this._parseErrors,
      status,
    };
  }

  /**
   * Close the WebSocket server.
   */
  close(): void {
    this.cleanup();
    this.wss?.close();
    this.wss = null;
  }
}

/** Singleton CDC WebSocket server instance */
export const cdcWebSocketServer = new CdcWebSocketServer();
