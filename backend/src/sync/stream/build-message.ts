import { isRealtimeEntity } from 'config';
import { generateCacheToken } from '#/lib/cache-token';
import type { StreamNotification } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Options for building stream notifications.
 */
export interface BuildNotificationOptions {
  /** User ID for cache token generation. If provided, a cache token is included. */
  userId?: string;
  /** Organization IDs the user has access to. Required if userId is provided. */
  organizationIds?: string[];
}

/**
 * Build stream notification from activity event.
 * Used for notification-based sync - lightweight payload without entity data.
 *
 * When userId and organizationIds are provided, generates a cacheToken that allows
 * clients to access the LRU entity cache. The first client to fetch with this token
 * populates the cache; subsequent clients get a cache hit.
 */
export function buildStreamNotification(
  event: ActivityEventWithEntity,
  options: BuildNotificationOptions = {},
): StreamNotification {
  const { entityType } = event;

  // Only realtime entity types should reach this path
  if (!isRealtimeEntity(entityType)) {
    throw new Error(`${entityType} is not a realtime entity type`);
  }

  if (!event.tx) {
    throw new Error(`Activity ${event.id} missing tx - realtime entities must have tx`);
  }

  // Generate cache token if user context is available
  let cacheToken: string | null = null;
  if (options.userId && options.organizationIds) {
    cacheToken = generateCacheToken(
      options.userId,
      options.organizationIds,
      entityType,
      event.entityId!,
      event.tx.version,
    );
  }

  return {
    action: event.action,
    entityType,
    resourceType: null,
    entityId: event.entityId!,
    organizationId: event.organizationId ?? null,
    contextType: null,
    seq: event.seq ?? 0,
    tx: {
      id: event.tx.id,
      sourceId: event.tx.sourceId,
      version: event.tx.version,
      fieldVersions: event.tx.fieldVersions,
    },
    cacheToken,
  };
}
