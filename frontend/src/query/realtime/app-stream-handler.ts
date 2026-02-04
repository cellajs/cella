import type { ContextEntityType, ProductEntityType } from 'config';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic';
import { sourceId } from '~/query/offline';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { getSyncPriority } from './sync-priority';
import type { AppStreamNotification } from './types';

/**
 * Per-scope sequence tracking for gap detection.
 * Key: scopeKey (orgId or 'global:entityType'), Value: last seen seq
 */
const seqStore = new Map<string, number>();

/**
 * Build a scope key for seq tracking.
 */
function getScopeKey(orgId: string | null, entityType: string): string {
  return orgId ?? `global:${entityType}`;
}

/**
 * Handles incoming app stream notifications and updates the React Query cache accordingly.
 * Routes notifications to membership, organization, or product entity handlers.
 *
 * Notification-only format: no entity data is included. Handlers invalidate queries
 * to trigger refetch, or use cacheToken for efficient fetches.
 */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { entityId, action, resourceType, entityType, tx, organizationId, contextType, seq, cacheToken, _trace } =
    notification;

  withSpanSync(syncSpanNames.messageProcess, { entityType, action, entityId, _trace }, () => {
    // Store cache token if present (for product entities)
    if (cacheToken) {
      cacheOps.storeEntityCacheToken(entityType ?? '', entityId, cacheToken);
    }

    // Membership events (resourceType = 'membership')
    if (resourceType === 'membership') {
      handleMembershipNotification(action, organizationId, contextType);
      return;
    }

    // Realtime entity events - use registry for dynamic lookup
    if (entityType) {
      const keys = getEntityQueryKeys(entityType);
      if (keys) {
        handleEntityNotification(entityType as ProductEntityType, entityId, action, tx, organizationId, seq, keys);
      }
    }
  });
}

/**
 * Handle membership events (created, updated, deleted).
 * Uses contextType for targeted query invalidation instead of broad invalidation.
 *
 * Strategy:
 * - create: Invalidate the specific context entity list (e.g., organizations), then refresh menu
 * - update: Invalidate member queries for the org, refresh user data for role changes
 * - delete: Invalidate the specific context entity list, then refresh menu
 */
function handleMembershipNotification(
  action: AppStreamNotification['action'],
  organizationId: string | null,
  contextType: ContextEntityType | null,
): void {
  switch (action) {
    case 'create':
      membershipOps.invalidateContextList(contextType);
      membershipOps.refreshMenu();
      break;

    case 'update':
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.refreshMe();
      break;

    case 'delete':
      membershipOps.invalidateContextList(contextType);
      membershipOps.refreshMenu();
      break;
  }

  console.debug(`[handleMembershipNotification] ${action} contextType=${contextType} orgId=${organizationId}`);
}

/**
 * Handle product entity events (page, attachment, etc).
 * Uses notification-based sync: no entity data included.
 * Invalidates queries to trigger refetch, using cacheToken for efficient fetches.
 */
function handleEntityNotification(
  entityType: ProductEntityType,
  entityId: string,
  action: AppStreamNotification['action'],
  tx: AppStreamNotification['tx'],
  organizationId: string | null,
  seq: number | null,
  keys: EntityQueryKeys,
): void {
  // Echo prevention: skip if this is our own mutation
  if (tx?.sourceId === sourceId) {
    console.debug('[handleEntityNotification] Echo prevention - skipping own mutation:', tx.id);
    return;
  }

  // Seq-based gap detection
  if (seq != null) {
    const scopeKey = getScopeKey(organizationId, entityType);
    const lastSeenSeq = seqStore.get(scopeKey) ?? 0;

    if (seq > lastSeenSeq + 1) {
      // Missed changes - invalidate list for this scope
      console.warn(`[handleEntityNotification] Missed ${seq - lastSeenSeq - 1} changes in ${scopeKey}`);
      cacheOps.invalidateEntityList(keys, 'active');
    }
    seqStore.set(scopeKey, seq);
  }

  // Determine fetch priority based on entityConfig ancestors and current route
  const priority = getSyncPriority({ entityType, entityId, organizationId });

  // Map priority to refetchType:
  // - high: immediate refetch of active queries
  // - medium: debounced refetch (batch updates)
  // - low: invalidate only, refetch on next access
  const refetchType = priority === 'low' ? 'none' : 'active';

  // For medium priority, debounce the invalidation
  if (priority === 'medium') {
    debouncedInvalidateList(entityType, keys);
  }

  switch (action) {
    case 'create':
      // Invalidate list queries - refetch behavior based on priority
      if (priority !== 'medium') {
        cacheOps.invalidateEntityList(keys, refetchType);
      }
      break;

    case 'update':
      // Invalidate detail and list to trigger refetch based on priority
      cacheOps.invalidateEntityDetail(entityId, keys, refetchType);
      if (priority !== 'medium') {
        cacheOps.invalidateEntityList(keys, refetchType);
      }
      break;

    case 'delete':
      // Remove from cache (detail + token)
      cacheOps.removeEntityFromCache(entityType, entityId);
      // Invalidate list - refetch behavior based on priority
      if (priority !== 'medium') {
        cacheOps.invalidateEntityList(keys, refetchType);
      }
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}

/** Debounce timers for medium priority list invalidations */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce list invalidations for medium priority to batch rapid updates */
function debouncedInvalidateList(entityType: string, keys: EntityQueryKeys): void {
  const existing = debounceTimers.get(entityType);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    entityType,
    setTimeout(() => {
      cacheOps.invalidateEntityList(keys, 'active');
      debounceTimers.delete(entityType);
    }, 500),
  );
}
