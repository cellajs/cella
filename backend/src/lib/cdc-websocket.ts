import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { z } from '@hono/zod-openapi';
import { isValidEventType } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { type WebSocket, WebSocketServer } from 'ws';
import { env, modeSecret } from '#/env';
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
    .object({ traceId: z.string(), spanId: z.string(), traceFlags: z.number().optional(), cdcTimestamp: z.number(), lsn: z.string().optional() })
    .optional(),
});

export type CdcMessage = z.infer<typeof cdcMessageSchema>;

const IDLE_TIMEOUT_MS = 90_000;

const PING_INTERVAL_MS = 30_000;

/**
 * Why an upgrade's `x-cdc-secret` is refused, or undefined for the worker's own secret. A process that does not hold
 * the secret refuses every upgrade.
 * @param presented - The header as received.
 * @returns The reason, or undefined for the worker's secret.
 */
export function cdcSecretRefusal(presented: string | string[] | undefined): string | undefined {
  let expected: string;
  try {
    expected = modeSecret('CDC_SECRET');
  } catch {
    return 'CDC_SECRET not configured';
  }
  return typeof presented === 'string' && safeEqual(presented, expected) ? undefined : 'invalid secret';
}

/** WAL lag alert from the worker's `wal_lag_alert` control message. */
export interface CdcLagAlert {
  severity: 'wal_lag_warn' | 'wal_lag_unhealthy';
  lagBytes: number | null;
  warnThreshold: number | null;
  unhealthyThreshold: number | null;
  slotStatus: string | null;
  receivedAt: string;
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
  /** How long ago the transaction the worker read last committed, in milliseconds. */
  lagMs?: number | null;
  /** Generation of the sync books: it moves when the worker corrected or rebuilt them. */
  generation?: number;
  /** Whether the worker keeps failing at one position because of the change there. */
  stuck?: boolean;
  /** The failure the worker reads again from: its position, how often the change itself failed there, and the error. */
  failure?: { position: string; count: number; error: string; passing: boolean } | null;
  /** What the worker's setup check found wrong; while it is not empty the worker reads nothing. */
  setupProblems?: string[];
  /** Whether the worker's database role effectively bypasses RLS on every RLS-enabled table (owner of never-forced tables, BYPASSRLS, or superuser); null until probed. */
  rlsBypass?: boolean | null;
  /** Whether the worker's database role may open a replication slot; null until probed. */
  roleReplication?: boolean | null;
}

/**
 * The CDC worker's channel: one live connection, idle peers closed. The internal listener (lib/listeners.ts) routes
 * and authenticates the upgrade before handing it over.
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
  private _lastLagAlert: CdcLagAlert | null = null;
  private _generation: number | null = null;
  private generationListeners: ((generation: number) => void)[] = [];

  /** Completes the handshake of an upgrade the internal listener authenticated and takes the connection. */
  accept(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss ??= new WebSocketServer({ noServer: true });
    this.wss.handleUpgrade(request, socket, head, (ws) => this.handleConnection(ws));
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

      // Handle CDC control messages (health, lag alerts) before schema validation
      if (parsed?._control) {
        this.handleControlMessage(parsed);
        return;
      }

      const result = cdcMessageSchema.safeParse(parsed);

      if (!result.success) {
        this._parseErrors++;
        const preview = { type: parsed?.activity?.type, subjectId: parsed?.activity?.subjectId, action: parsed?.activity?.action };
        log.error('CDC message schema validation failed - message dropped', { errors: result.error.issues, preview });
        return;
      }

      const message = result.data;
      this._messagesReceived++;
      this._lastMessageAt = new Date();

      const { type } = message.activity;
      if (!isValidEventType(type)) {
        this._parseErrors++;
        log.error('Unknown event type in CDC message - message dropped', { type, subjectId: message.activity.subjectId });
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

      log.trace('CDC message processed', { type: message.activity.type, subjectId: message.activity.subjectId });

      activityBus.emit(activityEvent);
    } catch (err) {
      this._parseErrors++;
      log.error('Failed to parse CDC message', { err });
    }
  }

  /**
   * The first generation the worker reports is where this process starts; a later, other one means the books were
   * corrected or rebuilt while clients were connected.
   */
  private noteGeneration(generation: number | undefined): void {
    if (typeof generation !== 'number' || generation === this._generation) return;
    const moved = this._generation !== null;
    this._generation = generation;
    if (moved) for (const listener of this.generationListeners) listener(generation);
  }

  /** Registers what to do when the worker's books move to another generation. */
  onGenerationChange(listener: (generation: number) => void): void {
    this.generationListeners.push(listener);
  }

  /** Handle CDC signals sent outside the activity stream: health reports and WAL lag alerts. */
  private handleControlMessage(message: { _control: string; [key: string]: unknown }): void {
    if (message._control === 'health') {
      const payload = message.payload as CdcWorkerHealth | undefined;
      if (payload?.replicationStatus) {
        this._workerHealth = { payload, receivedAt: new Date() };
        this.noteGeneration(payload.generation);
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
      if (alert.severity === 'wal_lag_unhealthy') log.error('CDC WAL lag exceeded the backpressure limit', { ...alert });
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
