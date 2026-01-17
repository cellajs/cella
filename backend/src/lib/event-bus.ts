import { EventEmitter } from 'node:events';
import { appConfig } from 'config';
import pg from 'pg';
import type { ActivityModel } from '#/db/schema/activities';
import { env } from '#/env';
import { resourceTypes } from '#/table-config';
import { logEvent } from '#/utils/logger';

/**
 * PostgreSQL channel name for activity events.
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
 * Activity event payload received from PostgreSQL NOTIFY.
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
}

/**
 * Event handler function type.
 */
type EventHandler = (event: ActivityEvent) => void | Promise<void>;

/**
 * Options for emitting events.
 */
interface EmitOptions {
  /** If true, also send via PostgreSQL NOTIFY (useful for testing cross-process) */
  notify?: boolean;
}

/**
 * Event bus that listens to PostgreSQL NOTIFY on the activities table.
 * Modules can subscribe to specific event types (e.g., 'membership.created').
 *
 * @example
 * ```typescript
 * import { eventBus } from '#/lib/event-bus';
 *
 * // Subscribe to membership creation events
 * eventBus.on('membership.created', async (event) => {
 *   console.info('New membership:', event.entityId);
 * });
 *
 * // Start listening (called once at server startup)
 * await eventBus.start();
 * ```
 */
class EventBus {
  private emitter = new EventEmitter();
  private client: pg.Client | null = null;
  private isStarted = false;

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
   * Emit an event locally and optionally via PostgreSQL NOTIFY.
   * Useful for testing and manual event triggering.
   * @param eventType - The event type to emit
   * @param event - The activity event payload
   * @param options - Emit options (e.g., notify: true to also send via NOTIFY)
   */
  async emit(eventType: ActivityEventType, event: ActivityEvent, options: EmitOptions = {}): Promise<void> {
    // Emit locally
    this.emitter.emit(eventType, event);

    // Optionally send via PostgreSQL NOTIFY (for cross-process testing)
    if (options.notify && this.client) {
      const payload = JSON.stringify(event);
      await this.client.query(`NOTIFY ${CHANNEL}, '${payload.replace(/'/g, "''")}'`);
    }
  }

  /**
   * Start listening for PostgreSQL NOTIFY events on the activities channel.
   * Should be called once at server startup.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      logEvent('warn', 'Event bus already started');
      return;
    }

    // Skip if using PGlite in basic mode (no LISTEN/NOTIFY support)
    if (env.DEV_MODE === 'basic') {
      logEvent('info', 'Event bus disabled (DEV_MODE=basic)');
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

          this.emitter.emit(event.type, event);
          logEvent('debug', 'Event bus received activity', { type: event.type, entityId: event.entityId });
        } catch (err) {
          logEvent('error', 'Failed to parse activity event', { error: err, payload: msg.payload });
        }
      });

      this.client.on('error', (err) => {
        logEvent('error', 'Event bus connection error', { error: err });
        this.reconnect();
      });

      this.isStarted = true;
      logEvent('info', 'Event bus started', { channel: CHANNEL });
    } catch (err) {
      logEvent('error', 'Failed to start event bus', { error: err });
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
    logEvent('info', 'Event bus stopped');
  }

  /**
   * Attempt to reconnect after a connection error.
   */
  private async reconnect(): Promise<void> {
    logEvent('info', 'Event bus reconnecting...');
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
        logEvent('error', 'Event bus reconnection failed', { error: err });
      });
    }, 5000);
  }
}

/** Singleton event bus instance */
export const eventBus = new EventBus();
