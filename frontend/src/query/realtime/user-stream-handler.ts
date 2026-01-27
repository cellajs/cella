import type { ContextEntityType, RealtimeEntityType } from 'config';
import type { Attachment, Page } from '~/api.gen';
import router from '~/lib/router';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { attachmentQueryKeys } from '~/modules/attachment/query';
import type { ContextEntityData } from '~/modules/entities/types';
import { getAndSetMe } from '~/modules/me/helpers';
import { memberQueryKeys } from '~/modules/memberships/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { organizationQueryKeys } from '~/modules/organization/query';
import { pageQueryKeys } from '~/modules/page/query';
import { sourceId } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { getSyncPriority } from './sync-priority';
import type { ProductEntityData, UserStreamMessage } from './user-stream-types';

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
 * Map context entity types to their query keys.
 * TODO can we do this dynamically, perhaps using the registry pattern?
 */
const contextEntityKeysMap = {
  organization: organizationQueryKeys,
  membership: memberQueryKeys,
} as const;

/**
 * Map product entity types to their query keys.
 */
const productEntityKeysMap: Record<
  RealtimeEntityType,
  {
    list: { base: readonly string[] };
    detail: { byId: (id: string) => readonly string[] };
  }
> = {
  attachment: attachmentQueryKeys,
  page: pageQueryKeys,
};

/**
 * Handles incoming user stream messages and updates the React Query cache accordingly.
 * Routes messages to membership, organization, or product entity handlers.
 * Supports both notification-push (new) and data-push (legacy) message formats.
 */
export function handleUserStreamMessage(message: UserStreamMessage): void {
  const { entityId, action, data, resourceType, entityType, tx, organizationId, seq, _trace } = message;

  withSpanSync(syncSpanNames.messageProcess, { entityType, action, entityId, _trace }, () => {
    // Membership events (legacy format with resourceType)
    if (resourceType === 'membership') {
      handleMembershipEvent(action, data);
      return;
    }

    // Organization events
    if (entityType === 'organization') {
      handleOrganizationEvent(action, entityId, data as ContextEntityData | null);
      return;
    }

    // Product entity events (page, attachment, etc.)
    if (entityType in productEntityKeysMap) {
      handleProductEntityEvent(
        entityType as RealtimeEntityType,
        entityId,
        action,
        data as ProductEntityData | null | undefined,
        tx,
        organizationId,
        seq,
      );
    }
  });
}

/**
 * Handle membership events (created, updated, deleted).
 */
function handleMembershipEvent(action: UserStreamMessage['action'], data: UserStreamMessage['data']): void {
  const entityType = (data as { entityType?: ContextEntityType } | null)?.entityType;
  const keys = entityType ? contextEntityKeysMap[entityType] : null;

  switch (action) {
    case 'create':
      // Membership created: user now belongs to a new entity → invalidate its list
      if (keys) {
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      }
      // Also refresh menu to show new entity
      getMenuData();
      break;

    case 'update':
      // Membership updated: update the single entity cache (e.g. role changed) and invalidate its list
      if (keys && data) {
        queryClient.setQueryData(keys.detail.byId(data.id), data);
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      }
      // Refresh user data in case role changed
      getAndSetMe();
      break;

    case 'delete':
      // Membership deleted: user no longer belongs to the entity → remove single cache and invalidate list
      if (keys && data) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(data.id), exact: true });
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      }
      // Refresh menu to remove entity
      getMenuData();
      break;
  }
}

/**
 * Handle organization events (created, updated, deleted).
 */
function handleOrganizationEvent(
  action: UserStreamMessage['action'],
  entityId: string,
  data: ContextEntityData | null,
): void {
  const keys = organizationQueryKeys;

  switch (action) {
    case 'create':
      // Entity created: a new entity was created → invalidate its list
      queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      break;

    case 'update':
      // Entity updated: update the single cache and invalidate list
      if (data) {
        // Get current cached data to check for slug change
        const cachedData = queryClient.getQueryData<ContextEntityData>(keys.detail.byId(entityId));
        const oldSlug = cachedData?.slug;
        const newSlug = data.slug;

        // Update cache
        queryClient.setQueryData(keys.detail.byId(entityId), data);
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });

        // If slug changed, update URL if user is on the entity page
        if (oldSlug && newSlug && oldSlug !== newSlug) {
          const { pathname, search, hash } = router.state.location;

          const slugSegmentRegex = new RegExp(`(/)${oldSlug}(/|$)`);
          if (slugSegmentRegex.test(pathname)) {
            const newPath = pathname.replace(slugSegmentRegex, `$1${newSlug}$2`);
            router.navigate({ to: newPath, replace: true, search, hash });
          }
        }
      }
      break;

    case 'delete':
      // Entity deleted: remove its caches
      queryClient.removeQueries({ queryKey: keys.detail.byId(entityId), exact: true });
      queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
      break;
  }
}

/**
 * Handle product entity events (page, attachment, etc).
 * Supports both notification-push (no data, seq-based gap detection) and
 * legacy data-push (full entity in data field) formats.
 */
function handleProductEntityEvent(
  entityType: RealtimeEntityType,
  entityId: string,
  action: UserStreamMessage['action'],
  data: ProductEntityData | null | undefined,
  tx: UserStreamMessage['tx'],
  organizationId: string | null,
  seq?: number,
): void {
  const keys = productEntityKeysMap[entityType];
  if (!keys) {
    console.debug('[handleProductEntityEvent] Unknown entity type:', entityType);
    return;
  }

  // Echo prevention: skip if this is our own mutation
  if (tx?.sourceId === sourceId) {
    console.debug('[handleProductEntityEvent] Echo prevention - skipping own mutation:', tx.id);
    return;
  }

  // Seq-based gap detection (notification format)
  if (seq != null) {
    const scopeKey = getScopeKey(organizationId, entityType);
    const lastSeenSeq = seqStore.get(scopeKey) ?? 0;

    if (seq > lastSeenSeq + 1) {
      // Missed changes - invalidate list for this scope
      console.warn(`[handleProductEntityEvent] Missed ${seq - lastSeenSeq - 1} changes in ${scopeKey}`);
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
      // Set detail query data if we have the full entity (legacy format)
      if (data) {
        queryClient.setQueryData(keys.detail.byId(entityId), data as Attachment | Page);
      }
      break;

    case 'update':
      // Update in cache if we have entity data (legacy format), otherwise invalidate to refetch
      if (data) {
        queryClient.setQueryData(keys.detail.byId(entityId), data as Attachment | Page);
      } else {
        // Notification format - invalidate to trigger refetch based on priority
        queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
      }
      // Invalidate list - refetch behavior based on priority
      if (priority !== 'medium') {
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
      }
      break;

    case 'delete':
      // Remove from detail cache (always immediate)
      queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
      // Invalidate list - refetch behavior based on priority
      if (priority !== 'medium') {
        queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
      }
      break;
  }

  console.debug(`[handleProductEntityEvent] ${entityType}:${action} priority=${priority}`);
}

/** Debounce timers for medium priority list invalidations */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce list invalidations for medium priority to batch rapid updates */
function debouncedInvalidateList(entityType: string, keys: { list: { base: readonly string[] } }): void {
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
