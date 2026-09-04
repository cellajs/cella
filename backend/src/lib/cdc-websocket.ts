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

/** Validates the CDC worker payload. @see cdc/src/services/activity-service.ts for the producing type. */
const cdcMessageSchema = z.object({
  activity: z.object({
    ...activitySchema.shape,
    // Override nullable fields that are always present in CDC messages
    action: activityActionSchema,
    subjectId: z.string().nullable(),
    // Org-sequence position stamped by the CDC worker (product entities only)
    seq: z.number().optional(),
    // Batch fields for multi-entity transactions; seq..batchUntilSeq ranges may interleave, so `count` is authoritative
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

export type CdcMessage = z.infer<typeof cdcMessageSchema>;

const IDLE_TIMEOUT_MS = 90_000;

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

/** Docker bridge ranges: the per-VM Caddy `ingress` runs there and is the only direct peer of a proxied request. */
function isDockerBridgeIp(ip: string): boolean {
  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ip) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip);
}

/** Allows loopback/VPC CDC peers directly or through the local ingress; the shared secret is the primary auth. */
function isAllowedCdcSource(remoteIp: string | undefined, forwardedFor: string | string[] | undefined): boolean {
  if (!remoteIp) return false;
  const peer = normalizeIp(remoteIp);

  // Direct connection, no proxy in between: the peer is the worker
  if (isLoopbackIp(peer) || isVpcIp(peer)) return true;

  // Behind the per-VM ingress the peer is the local Caddy, so trust X-Forwarded-For and check the reported client IP
  if (isDockerBridgeIp(peer)) {
    const xff = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const client = normalizeIp(xff?.split(',')[0]?.trim() ?? '');
    return isLoopbackIp(client) || isVpcIp(client);
  }

  return false;
}

/** Self-reported CDC worker health payload pushed over the WS control channel. */
/** WAL lag alert from the worker's `wal_lag_alert` control message. */
export interface CdcLagAlert {
  severity: 'wal_lag_warn' | 'wal_lag_unhealthy';
  lagBytes: number | null;
  warnThreshold: number | null;
  unhealthyThreshold: number | null;
  slotStatus: string | null;
  receivedAt: string;
}

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
  /** Whether the worker's database role effectively bypasses RLS on every RLS-enabled table (owner of never-forced tables, BYPASSRLS, or superuser); null until probed. */
  rlsBypass?: boolean | null;
  /** Whether the worker's database role may open a replication slot; null until probed. */
  roleReplication?: boolean | null;
}

/** Internal CDC worker channel: shared secret plus allowed source, one live connection, idle peers closed. */
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
  private _lastLagAlert: CdcLagAlert | null = null;

  /** Attach to an existing HTTP server and authenticate upgrade requests to /internal/cdc. */
  attachToServer(server: ServerType): void {
    this.wss = new WebSocketServer({ noServer: true });

    // Type assertion needed because ServerType is broader than HTTP1 Server
    (server as NodeJS.EventEmitter).on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host}`);
      if (url.pathname !== '/internal/cdc') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      // Production accepts co-located loopback or VPC workers only
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

  /** Accept a CDC worker connection, replacing any live one. */
  private handleConnection(ws: WebSocket): void {
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

  /** Validate an incoming CDC message and transform it into an ActivityBus event. */
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

      const { type } = message.activity;
      if (!isValidEventType(type)) {
        this._parseErrors++;
        log.error('Unknown event type in CDC message - message dropped', {
          type,
          subjectId: message.activity.subjectId,
        });
        return;
      }

      // Invalidate each changed entity by id so a later detail fetch re-enriches (entity-keyed cache, no token)
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

  /** Handle CDC lifecycle signals such as catchup completion, sent outside the activity stream. */
  private handleControlMessage(message: { _control: string; [key: string]: unknown }): void {
    if (message._control === 'catchup_complete') {
      const eventsProcessed = message.eventsProcessed ?? 0;
      const catchupDurationMs = message.catchupDurationMs ?? 0;

      // Clear entity caches after counter recalculation.
      productCache.clear();

      log.info('CDC catchup complete: entity caches cleared', {
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

    if (message._control === 'wal_lag_alert') {
      const { severity, lagBytes, warnThreshold, unhealthyThreshold, slotStatus } = message as Partial<CdcLagAlert>;
      const alert: CdcLagAlert = {
        severity: severity === 'wal_lag_unhealthy' ? 'wal_lag_unhealthy' : 'wal_lag_warn',
        lagBytes: typeof lagBytes === 'number' ? lagBytes : null,
        warnThreshold: typeof warnThreshold === 'number' ? warnThreshold : null,
        unhealthyThreshold: typeof unhealthyThreshold === 'number' ? unhealthyThreshold : null,
        slotStatus: typeof slotStatus === 'string' ? slotStatus : null,
        receivedAt: new Date().toISOString(),
      };
      this._lastLagAlert = alert;
      if (alert.severity === 'wal_lag_unhealthy')
        log.error('CDC WAL lag exceeded the backpressure limit', { ...alert });
      else log.warn('CDC WAL lag above warning threshold', { ...alert });
      return;
    }

    log.warn('Unknown CDC control message', { control: message._control });
  }

  /** Reset the idle timer; the connection closes when no activity arrives. */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      log.warn('CDC WebSocket idle timeout, closing connection');
      this.currentConnection?.close(1000, 'Idle timeout');
    }, IDLE_TIMEOUT_MS);
  }

  private startPingInterval(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.currentConnection?.readyState === 1) {
        // WebSocket.OPEN
        this.currentConnection.ping();
      }
    }, PING_INTERVAL_MS);
  }

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
    this._lastLagAlert = null;
  }

  /** Latest CDC worker self-report received over the WS control channel. */
  getWorkerHealth(): { payload: CdcWorkerHealth; receivedAt: Date } | null {
    return this._workerHealth;
  }

  /** Last `wal_lag_alert` the worker sent; cleared with the worker's health on disconnect. */
  getLastLagAlert(): CdcLagAlert | null {
    return this._lastLagAlert;
  }

  getHealthStatus(): {
    cdcConnected: boolean;
    lastMessageAt: string | null;
    messagesReceived: number;
    parseErrors: number;
    status: 'healthy' | 'degraded' | 'unknown';
  } {
    let status: 'healthy' | 'degraded' | 'unknown' = 'unknown';

    if (this._cdcConnected) {
      const sixtySecondsAgo = Date.now() - 60_000;
      if (this._lastMessageAt && this._lastMessageAt.getTime() > sixtySecondsAgo) {
        status = 'healthy';
      } else if (this._lastMessageAt) {
        status = 'degraded'; // Connected but no recent messages
      } else {
        status = 'healthy'; // Just connected, no messages yet is OK
      }
    } else if (!env.NODB) {
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

  close(): void {
    this.cleanup();
    this.wss?.close();
    this.wss = null;
  }
}

export const cdcWebSocketServer = new CdcWebSocketServer();
