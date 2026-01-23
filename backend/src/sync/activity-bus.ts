import { EventEmitter } from 'node:events';
import { appConfig } from 'config';
import pg from 'pg';
import type { ActivityModel } from '#/db/schema/activities';
import type { TxColumnData } from '#/db/utils/product-entity-columns';
import { env } from '#/env';
import { resourceTypes } from '#/table-config';
import { logEvent } from '#/utils/logger';

/**
 * PostgreSQL channel name for activity events.
 * Used as fallback when CDC Worker is not running (e.g., basic/core mode).
 */
const CHANNEL = 'cella_activities';

/**
 * Activity actions aligned with HTTP methods (excluding 'read').
 */
export const activityActions = ['create', 'update', 'delete'] as const;

export type ActivityAction = (typeof activityActions)[number];

/**
 * All possible tracked types (entities + resources).
 */
const trackedTypes = [...appConfig.entityTypes, ...resourceTypes] as const;
type TrackedType = (typeof trackedTypes)[number];

/**
 * Generate all possible activity event types.
 * Format: `{entityOrResourceType}.{verb}` (e.g., 'membership.created', 'user.updated')
 */
const actionVerbs = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
} as const satisfies Record<ActivityAction, string>;

type ActionVerb = (typeof actionVerbs)[ActivityAction];

/**
 * Strongly typed activity event type.
 * Examples: 'user.created', 'membership.updated', 'organization.deleted'
 */
export type ActivityEventType = `${TrackedType}.${ActionVerb}`;

/**
 * Generate all valid event types at runtime for validation.
 */
const validEventTypes = new Set<ActivityEventType>(
  trackedTypes.flatMap((type) =>
    activityActions.map((action) => `${type}.${actionVerbs[action]}` as ActivityEventType),
  ),
);

/**
 * Base activity event payload.
 * Strongly typed based on ActivityModel from the database schema.
 */
export interface ActivityEvent
  extends Pick<
    ActivityModel,
    | 'id'
    | 'type'
    | 'action'
    | 'tableName'
    | 'entityType'
    | 'resourceType'
    | 'entityId'
    | 'userId'
    | 'organizationId'
    | 'changedKeys'
  > {
  createdAt: string; // ISO string from JSON serialization
  tx: TxColumnData | null; // Transaction metadata for sync (null for context entities)
}

/**
 * Activity event with optional entity data.
 * Entity data is included when received from CDC Worker via WebSocket.
 */
export interface ActivityEventWithEntity extends ActivityEvent {
  /** Full entity data from CDC Worker replication row. Undefined for pg_notify fallback. */
  entity?: Record<string, unknown>;
}

/**
 * Event handler function type.
 */
type EventHandler = (event: ActivityEventWithEntity) => void | Promise<void>;

/**
 * Options for emitting events.
 */
interface EmitOptions {
  /** If true, also send via PostgreSQL NOTIFY (useful for testing cross-process) */
  notify?: boolean;
}

/**
 * ActivityBus receives activity notifications from CDC Worker via WebSocket
 * and distributes them to internal handlers and live stream subscribers.
 *
 * In production/full mode: Receives from CDC Worker WebSocket (includes entity data)
 * In basic/core mode: Falls back to PostgreSQL NOTIFY (no entity data)
 *
 * @example
 * ```typescript
 * import { activityBus } from '#/lib/activity-bus';
 *
 * // Subscribe to membership creation events
 * activityBus.on('membership.created', async (event) => {
 *   console.info('New membership:', event.entityId);
 *   if (event.entity) {
 *     console.info('Entity data:', event.entity);
 *   }
 * });
 *
 * // Start listening (called once at server startup)
 * await activityBus.start();
 * ```
 */
class ActivityBus {
  private emitter = new EventEmitter();
  private client: pg.Client | null = null;
  private isStarted = false;

  constructor() {
    // Increase max listeners to avoid warnings with many subscribers
    this.emitter.setMaxListeners(100);
  }

  /**
   * Subscribe to a specific activity event type.
   * @param eventType - The event type to listen for (e.g., 'membership.created')
   * @param handler - The handler function to call when the event occurs
   */
  on(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.on(eventType, handler);
    return this;
  }

  /**
   * Subscribe to a specific activity event type (one-time).
   * @param eventType - The event type to listen for
   * @param handler - The handler function to call once
   */
  once(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.once(eventType, handler);
    return this;
  }

  /**
   * Unsubscribe from a specific activity event type.
   * @param eventType - The event type to stop listening for
   * @param handler - The specific handler to remove
   */
  off(eventType: ActivityEventType, handler: EventHandler): this {
    this.emitter.off(eventType, handler);
    return this;
  }

  /**
   * Subscribe to all activity events (wildcard).
   * Useful for stream handlers that need to fan out to subscribers.
   * @param handler - The handler function to call for any event
   */
  onAny(handler: EventHandler): this {
    // Subscribe to all valid event types
    for (const eventType of validEventTypes) {
      this.emitter.on(eventType, handler);
    }
    return this;
  }

  /**
   * Unsubscribe from all activity events.
   * @param handler - The handler function to remove from all event types
   */
  offAny(handler: EventHandler): this {
    for (const eventType of validEventTypes) {
      this.emitter.off(eventType, handler);
    }
    return this;
  }

  /**
   * Emit an activity event received from CDC Worker via WebSocket.
   * This is the primary path in production/full mode.
   * @param event - The activity event with entity data
   */
  emitFromCdc(event: ActivityEventWithEntity): void {
    if (!validEventTypes.has(event.type as ActivityEventType)) {
      logEvent('warn', 'Unknown activity event type from CDC', { type: event.type });
      return;
    }

    this.emitter.emit(event.type, event);
    logEvent('debug', 'ActivityBus emitted CDC event', { type: event.type, entityId: event.entityId });
  }

  /**
   * Emit an event locally and optionally via PostgreSQL NOTIFY.
   * Useful for testing and manual event triggering.
   * @param eventType - The event type to emit
   * @param event - The activity event payload
   * @param options - Emit options (e.g., notify: true to also send via NOTIFY)
   */
  async emit(eventType: ActivityEventType, event: ActivityEventWithEntity, options: EmitOptions = {}): Promise<void> {
    // Emit locally
    this.emitter.emit(eventType, event);

    // Optionally send via PostgreSQL NOTIFY (for cross-process testing)
    if (options.notify && this.client) {
      const payload = JSON.stringify(event);
      await this.client.query(`NOTIFY ${CHANNEL}, '${payload.replace(/'/g, "''")}'`);
    }
  }

  /**
   * Start listening for PostgreSQL NOTIFY events as fallback.
   * In full/production mode, events come from CDC Worker via WebSocket.
   * In basic/core mode, events come from pg_notify trigger.
   * Should be called once at server startup.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      logEvent('warn', 'ActivityBus already started');
      return;
    }

    // Skip pg LISTEN if using PGlite in basic mode (no LISTEN/NOTIFY support)
    if (env.DEV_MODE === 'basic') {
      logEvent('info', 'ActivityBus started (no pg LISTEN in basic mode)');
      this.isStarted = true;
      return;
    }

    try {
      this.client = new pg.Client({ connectionString: env.DATABASE_URL });
      await this.client.connect();
      await this.client.query(`LISTEN ${CHANNEL}`);

      this.client.on('notification', (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;

        try {
          const event = JSON.parse(msg.payload) as ActivityEvent;

          // Validate event type against known types
          if (!validEventTypes.has(event.type as ActivityEventType)) {
            logEvent('warn', 'Unknown activity event type', { type: event.type });
            return;
          }

          // pg_notify fallback: no entity data available
          const eventWithEntity: ActivityEventWithEntity = { ...event, entity: undefined };
          this.emitter.emit(event.type, eventWithEntity);
          logEvent('debug', 'ActivityBus received pg_notify', { type: event.type, entityId: event.entityId });
        } catch (err) {
          logEvent('error', 'Failed to parse activity event', { error: err, payload: msg.payload });
        }
      });

      this.client.on('error', (err) => {
        logEvent('error', 'ActivityBus connection error', { error: err });
        this.reconnect();
      });

      this.isStarted = true;
      logEvent('info', 'ActivityBus started', { channel: CHANNEL });
    } catch (err) {
      logEvent('error', 'Failed to start ActivityBus', { error: err });
      throw err;
    }
  }

  /**
   * Stop listening and close the connection.
   */
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
    this.isStarted = false;
    logEvent('info', 'ActivityBus stopped');
  }

  /**
   * Attempt to reconnect after a connection error.
   */
  private async reconnect(): Promise<void> {
    logEvent('info', 'ActivityBus reconnecting...');
    this.isStarted = false;
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // Ignore errors during cleanup
      }
      this.client = null;
    }

    // Exponential backoff retry
    setTimeout(() => {
      this.start().catch((err) => {
        logEvent('error', 'ActivityBus reconnection failed', { error: err });
      });
    }, 5000);
  }
}

/** Singleton ActivityBus instance */
export const activityBus = new ActivityBus();

// Re-export for backward compatibility with existing code using eventBus
export { activityBus as eventBus };
