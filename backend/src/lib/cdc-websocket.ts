import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { z } from '@hono/zod-openapi';
import { appConfig, isProduct, isValidEventType } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { type WebSocket, WebSocketServer } from 'ws';
import { modeSecret } from '#/env';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { productCache } from '#/middlewares/product-cache/app-product-cache';
import { activityActionSchema, activitySchema } from '#/modules/activities/activities-schema';
import { log } from '#/utils/logger';

const rowDataSchema = z.record(z.string(), z.unknown());

/** One product row: its permission fields, its org-sequence position, and for a moved row the permission fields it had before. */
const messageRowSchema = z.object({
  rowData: rowDataSchema,
  seq: z.number().optional(),
  movedFrom: rowDataSchema.nullable().optional(),
});

/** The activity of a message's row, or of its first row. `action` and `subjectId` override fields that are always present. */
const messageActivityShape = { ...activitySchema.shape, action: activityActionSchema, subjectId: z.string().nullable() };

const messageTraceSchema = z
  .object({ traceId: z.string(), spanId: z.string(), traceFlags: z.number().optional(), cdcTimestamp: z.number(), lsn: z.string().optional() })
  .optional();

/**
 * Validates the CDC worker payload: the product rows of one audience as `rows`, or the one whole row of a change that
 * is no product as `rowData`. @see cdc/src/services/activity-service.ts for the producing type.
 */
const cdcMessageSchema = z.union([
  z.object({ activity: z.object(messageActivityShape), rows: z.array(messageRowSchema).min(1), _trace: messageTraceSchema }),
  z.object({
    // `seq` and `batchRows` belong to an older worker's product messages and go together with the lines of `contentOf` that read them.
    activity: z.object({ ...messageActivityShape, seq: z.number().optional() }),
    rowData: rowDataSchema,
    movedFrom: rowDataSchema.nullable().optional(),
    batchRows: z.array(messageRowSchema).optional(),
    _trace: messageTraceSchema,
  }),
]);

export type CdcMessage = z.infer<typeof cdcMessageSchema>;

/**
 * What a message holds, as everything behind the socket reads it: the rows of a product message, or the one whole row
 * of any other.
 */
function contentOf(message: CdcMessage): Pick<ActivityEvent, 'rows' | 'rowData'> {
  if ('rows' in message) return { rows: message.rows, rowData: null };
  if (!isProduct(message.activity.entityType)) return { rows: null, rowData: message.rowData };
  // An older worker sends a product row as one whole row, and several as `batchRows`: this can go after one release.
  const single = { rowData: message.rowData, seq: message.activity.seq, movedFrom: message.movedFrom };
  return { rows: message.batchRows?.length ? message.batchRows : [single], rowData: null };
}

/** The worker's health push arrives every 15 seconds, so a connection this long without a message is dead. */
const IDLE_TIMEOUT_MS = 90_000;

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

/** What the CDC worker reports about itself, pushed every 15 seconds and at once after an incident. */
export interface CdcWorkerHealth {
  /** The worker's own grade. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Why it is not healthy; empty when it is. Stable identifiers such as `replication_stopped`, `api_away`, `reading_again`, `worker_stuck`, `setup_problems`, `slot_inactive`, `slot_lost`, `wal_lag_high`, `wal_lag_critical`, `event_loop_lag`. */
  reasons: string[];
  /** Diagnosis for a person: replication status and positions, lag, the failure it reads again from, setup problems, the slot. */
  details: Record<string, unknown>;
  /** Generation of the sync books: it moves when the worker rebuilt them. */
  generation: number;
}

/**
 * How long no worker may read before clients are told. A restart, a deploy and a second read of a failed flush are
 * shorter than this.
 */
const WORKER_AWAY_AFTER_MS = 60_000;

/** The grades a health report may carry; one with another grade is unreadable. */
const workerGrades: readonly unknown[] = ['healthy', 'degraded', 'unhealthy'] satisfies CdcWorkerHealth['status'][];

/**
 * The CDC worker's channel: one live connection, closed after 90 seconds without a message. The internal listener
 * (lib/listeners.ts) routes and authenticates the upgrade before handing it over.
 */
class CdcWebSocketServer {
  private wss: WebSocketServer | null = null;
  private currentConnection: WebSocket | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  // Health metrics
  private _lastMessageAt: Date | null = null;
  private _messagesReceived = 0;
  private _parseErrors = 0;
  private _workerHealth: { health: CdcWorkerHealth | null; receivedAt: Date } | null = null;
  private _generation: number | null = null;
  private generationListeners: ((generation: number) => void)[] = [];
  /**
   * Since when no worker reads for this process: none is connected, or the one that is reports that it does not read
   * or that it is unhealthy. Null while one reads. A process that just started has no worker yet.
   */
  private notReadingSince: number | null = Date.now();

  /** Completes the handshake of an upgrade the internal listener authenticated and takes the connection. */
  accept(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss ??= new WebSocketServer({ noServer: true });
    this.wss.handleUpgrade(request, socket, head, (ws) => this.handleConnection(ws));
  }

  /**
   * Takes a CDC worker connection in place of the live one. Only the live connection may change the state held here:
   * a replaced one is closed, and its messages, its close and its errors are ignored from then on.
   */
  private handleConnection(ws: WebSocket): void {
    const replaced = this.currentConnection;
    this.currentConnection = ws;
    // A health report belongs to the connection it arrived on, and so does the word that its worker reads.
    this._workerHealth = null;
    this.noteReading(false);
    this.resetIdleTimer();

    if (replaced) {
      log.info('Replacing existing CDC Worker connection');
      replaced.close(1000, 'Replaced by new connection');
    }

    log.info('CDC Worker connected via WebSocket');

    ws.on('message', (data) => {
      if (ws !== this.currentConnection) return;
      this.resetIdleTimer();
      this.handleMessage(data.toString());
    });

    ws.on('close', (code, reason) => {
      if (ws !== this.currentConnection) return;
      log.info('CDC Worker disconnected', { code, reason: reason.toString() });
      this.cleanup();
    });

    ws.on('error', (err) => {
      log.error('CDC WebSocket error', { err });
      if (ws === this.currentConnection) this.cleanup();
    });
  }

  /** Validate an incoming CDC message and transform it into an ActivityBus event. */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      // Control messages (the worker's health report) are no changes: they skip the schema.
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

      const { rows, rowData } = contentOf(message);

      // Drop the detail cache entry of each changed product row, so a later detail fetch re-enriches (entity-keyed cache, no token)
      const { entityType } = message.activity;
      for (const row of rows ?? []) {
        if (entityType && typeof row.rowData.id === 'string') productCache.invalidateProduct(entityType, row.rowData.id);
      }

      const activityEvent = { ...message.activity, type, rowData, rows, trace: message._trace ?? null } as ActivityEvent;

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

  /**
   * Takes what the worker sends beside its changes: its health report. A report of another shape, as a worker of
   * another release sends during a deploy, is held as unreadable, and its generation still counts. Any other control
   * message is ignored.
   */
  private handleControlMessage(message: { _control: string; payload?: unknown }): void {
    if (message._control !== 'health') {
      log.debug('Unknown CDC control message ignored', { control: message._control });
      return;
    }

    const payload = (message.payload ?? {}) as Partial<CdcWorkerHealth>;
    const readable = workerGrades.includes(payload.status) && Array.isArray(payload.reasons);
    this._workerHealth = { health: readable ? (payload as CdcWorkerHealth) : null, receivedAt: new Date() };
    // A report this process cannot read says nothing of reading: it is taken as none, like the messages beside it.
    this.noteReading(readable && payload.status !== 'unhealthy' && payload.details?.replication === 'active');
    this.noteGeneration(payload.generation);
  }

  /** Keeps since when no worker reads: the moment reading stopped, until it starts again. */
  private noteReading(reading: boolean): void {
    if (reading) this.notReadingSince = null;
    else this.notReadingSince ??= Date.now();
  }

  /**
   * Whether no CDC worker has been reading for a minute. Live changes then reach clients late, so the app stream tells
   * them and they fall back to a stale time. An app that runs no worker has nothing to wait for and is never away.
   */
  isWorkerAway(): boolean {
    if (!appConfig.services.cdc.enabled) return false;
    return this.notReadingSince !== null && Date.now() - this.notReadingSince >= WORKER_AWAY_AFTER_MS;
  }

  /** Starts the idle time anew; a connection that sends no message for 90 seconds is closed. */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      log.warn('CDC WebSocket idle timeout, closing connection');
      this.currentConnection?.close(1000, 'Idle timeout');
    }, IDLE_TIMEOUT_MS);
  }

  /** Forgets the live connection and what it reported. */
  private cleanup(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.currentConnection = null;
    this._workerHealth = null;
    this.noteReading(false);
  }

  /** The worker's latest health report on the live connection; `health` is null when its shape could not be read. */
  getWorkerHealth(): { health: CdcWorkerHealth | null; receivedAt: Date } | null {
    return this._workerHealth;
  }

  /** The socket as this process sees it: whether a worker is connected, and what arrived over it. */
  getHealthStatus(): { cdcConnected: boolean; lastMessageAt: string | null; messagesReceived: number; parseErrors: number } {
    return {
      cdcConnected: this.currentConnection !== null,
      lastMessageAt: this._lastMessageAt?.toISOString() ?? null,
      messagesReceived: this._messagesReceived,
      parseErrors: this._parseErrors,
    };
  }

  close(): void {
    this.cleanup();
    this.wss?.close();
    this.wss = null;
  }
}

export const cdcWebSocketServer = new CdcWebSocketServer();
