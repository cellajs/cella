/**
 * Batch catchup processor for offline sync.
 *
 * Processes a batch of catchup activities efficiently:
 * - Handles deletes immediately (remove from cache)
 * - Groups create/update by entityType
 * - Single list invalidation per type (triggers modifiedAfter fetch)
 * - Single membership refresh per batch
 *
 * Uses shared primitives from cache-ops.ts and membership-ops.ts.
 */

import { getEntityQueryKeys } from '~/query/basic';
import { sourceId } from '~/query/offline';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import type { AppStreamNotification } from './types';

export interface CatchupOptions {
  /** ISO timestamp of last successful sync (for modifiedAfter queries) */
  lastSyncAt: string | null;
}

/**
 * Process a batch of catchup activities.
 * Optimized for batch processing - groups operations to minimize invalidations.
 *
 * @param activities - Array of catchup notifications to process
 * @param options - Processing options including lastSyncAt for delta queries
 */
export function processCatchupBatch(activities: AppStreamNotification[], options: CatchupOptions): void {
  if (activities.length === 0) return;

  // Echo prevention: filter out own mutations from catchup
  const filteredActivities = activities.filter((a) => a.stx?.sourceId !== sourceId);
  const skippedCount = activities.length - filteredActivities.length;
  if (skippedCount > 0) {
    console.debug(`[CatchupProcessor] Echo prevention: skipped ${skippedCount} own mutations`);
  }

  if (filteredActivities.length === 0) return;

  console.debug(
    `[CatchupProcessor] Processing ${filteredActivities.length} activities, lastSyncAt=${options.lastSyncAt}`,
  );

  // Phase 1: Immediate deletes (remove from cache)
  const deletes = filteredActivities.filter((a) => a.action === 'delete');
  for (const activity of deletes) {
    if (activity.entityType) {
      cacheOps.removeEntityFromCache(activity.entityType, activity.entityId);
      console.debug(`[CatchupProcessor] Removed ${activity.entityType}:${activity.entityId}`);
    }
  }

  // Phase 2: Collect entity types that need list refetch
  const createUpdates = filteredActivities.filter((a) => a.action !== 'delete');
  const entityTypesToRefetch = new Set<string>();

  for (const activity of createUpdates) {
    if (activity.entityType) {
      entityTypesToRefetch.add(activity.entityType);
    }
  }

  // Phase 3: Invalidate list queries per entity type
  // This triggers React Query to refetch with modifiedAfter param
  for (const entityType of entityTypesToRefetch) {
    const keys = getEntityQueryKeys(entityType);
    if (keys) {
      cacheOps.invalidateEntityList(keys, 'active');
      console.debug(`[CatchupProcessor] Invalidated ${entityType} list`);
    }
  }

  // Phase 4: Handle membership changes (once per batch)
  const membershipActivities = filteredActivities.filter((a) => a.resourceType === 'membership');
  if (membershipActivities.length > 0) {
    const hasCreateOrDelete = membershipActivities.some((a) => a.action === 'create' || a.action === 'delete');
    const hasUpdate = membershipActivities.some((a) => a.action === 'update');

    if (hasCreateOrDelete) {
      // contextType is null in catchup, so use fallback invalidation
      membershipOps.invalidateContextList(null);
      membershipOps.refreshMenu();
      console.debug('[CatchupProcessor] Refreshed menu for membership create/delete');
    }

    if (hasUpdate) {
      membershipOps.invalidateMemberQueries(null); // Invalidate all member queries
      membershipOps.refreshMe();
      console.debug('[CatchupProcessor] Refreshed me for membership update');
    }
  }

  console.debug(
    `[CatchupProcessor] Complete: ${deletes.length} deletes, ${entityTypesToRefetch.size} entity types, ${membershipActivities.length} membership events`,
  );
}

/**
 * Process delete activities only.
 * Used for immediate delete handling while queuing creates/updates.
 */
export function processDeletesOnly(activities: AppStreamNotification[]): AppStreamNotification[] {
  const deletes = activities.filter((a) => a.action === 'delete');
  const remaining = activities.filter((a) => a.action !== 'delete');

  for (const activity of deletes) {
    if (activity.entityType) {
      cacheOps.removeEntityFromCache(activity.entityType, activity.entityId);
    }
    if (activity.resourceType === 'membership') {
      // For membership deletes, also refresh menu immediately
      membershipOps.invalidateContextList(null);
      membershipOps.refreshMenu();
    }
  }

  return remaining;
}
