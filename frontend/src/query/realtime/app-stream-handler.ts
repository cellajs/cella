import type { ContextEntityType, RealtimeEntityType } from 'config';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { getAndSetMe } from '~/modules/me/helpers';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic';
import { sourceId } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';
import type { AppStreamNotification } from './app-stream-types';
import { removeCacheToken, storeCacheToken } from './cache-token-store';
import { getSyncPriority } from './sync-priority';

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
    if (cacheToken && tx?.version) {
      storeCacheToken(entityType ?? '', entityId, cacheToken, tx.version);
    }

    // Membership events (resourceType = 'membership')
    if (resourceType === 'membership') {
      handleMembershipNotification(action, entityId, organizationId, contextType);
      return;
    }

    // Realtime entity events - use registry for dynamic lookup
    if (entityType) {
      const keys = getEntityQueryKeys(entityType);
      if (keys) {
        handleEntityNotification(entityType as RealtimeEntityType, entityId, action, tx, organizationId, seq, keys);
      }
    }
  });
}

/**
 * Mark all context entity detail queries as stale.
 * Used as fallback when contextType is unknown - lighter than invalidating lists.
 * List data is refreshed via getMenuData() which is called after membership changes.
 */
function invalidateContextEntityDetails(): void {
  const registry = getContextEntityTypeToListQueries();
  for (const contextType of Object.keys(registry)) {
    // Invalidate detail queries with refetchType: 'none' (mark stale, don't refetch)
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === contextType && query.queryKey[1] === 'detail',
      refetchType: 'none',
    });
  }
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
  _entityId: string,
  organizationId: string | null,
  contextType: ContextEntityType | null,
): void {
  const userId = useUserStore.getState().user.id;

  // Get query factory for the specific context entity type
  const queryFactory = contextType ? getContextEntityTypeToListQueries()[contextType] : null;

  switch (action) {
    case 'create': {
      // Membership created: user now belongs to a new entity
      // Invalidate only the specific context entity list if we know the type
      if (queryFactory) {
        const queryKey = queryFactory({ userId }).queryKey;
        queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      } else {
        // Fallback: mark detail queries stale, list is refreshed via getMenuData()
        invalidateContextEntityDetails();
      }
      // Refresh menu to show new entity
      getMenuData();
      break;
    }

    case 'update': {
      // Membership updated: invalidate member queries for the specific org
      if (organizationId) {
        // Invalidate member lists that include this organization
        queryClient.invalidateQueries({
          queryKey: memberQueryKeys.list.base,
          predicate: (query) => query.queryKey.some((k) => typeof k === 'object' && k !== null && 'orgIdOrSlug' in k),
          refetchType: 'active',
        });
      }
      // Refresh user data in case role changed (affects permissions)
      getAndSetMe();
      break;
    }

    case 'delete': {
      // Membership deleted: user no longer belongs to the entity
      if (queryFactory) {
        const queryKey = queryFactory({ userId }).queryKey;
        queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      } else {
        // Fallback: mark detail queries stale, list is refreshed via getMenuData()
        invalidateContextEntityDetails();
      }
      // Refresh menu to remove entity
      getMenuData();
      break;
    }
  }

  console.debug(`[handleMembershipNotification] ${action} contextType=${contextType} orgId=${organizationId}`);
}

/**
 * Handle realtime entity events (page, attachment, etc).
 * Uses notification-based sync: no entity data included.
 * Invalidates queries to trigger refetch, using cacheToken for efficient fetches.
 */
function handleEntityNotification(
  entityType: RealtimeEntityType,
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
      queryClient.invalidateQueries({
        queryKey: keys.list.base,
        refetchType: 'active',
      });
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
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
      }
      break;

    case 'update':
      // Invalidate detail and list to trigger refetch based on priority
      queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
      if (priority !== 'medium') {
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
      }
      break;

    case 'delete':
      // Remove from detail cache (always immediate)
      queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
      // Remove cache token for deleted entity
      removeCacheToken(entityType, entityId);
      // Invalidate list - refetch behavior based on priority
      if (priority !== 'medium') {
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
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
      queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      debounceTimers.delete(entityType);
    }, 500),
  );
}
