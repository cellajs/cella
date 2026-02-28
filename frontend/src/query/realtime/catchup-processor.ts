/**
 * Catchup processors for offline sync.
 *
 * Processes summary-based catchup responses from the backend.
 * Uses seq delta to determine what changed per scope:
 *   - delta == deletedIds.length → only deletes (already handled)
 *   - delta > deletedIds.length → creates/updates → invalidate entity lists
 *   - delta == 0 → nothing changed
 *
 * App stream: scoped per orgId with priority routing
 * Public stream: scoped per entityType
 */

import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic';
import { useSyncStore } from '~/store/sync';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { getSyncPriority } from './sync-priority';
import type { AppCatchupResponse, PublicCatchupResponse } from './types';

/**
 * Process app stream catchup response.
 *
 * For each org:
 * 1. Remove deletedIds from cache
 * 2. Compare serverSeq with stored clientSeq
 * 3. If creates/updates detected, invalidate entity lists (with priority)
 * 4. Update stored seq
 *
 * Also handles membership changes (menu refresh, me refresh).
 */
export function processAppCatchup(response: AppCatchupResponse): void {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] App catchup: ${scopes.length} orgs`);

  for (const orgId of scopes) {
    const { seq: serverSeq, deletedIds, mSeq: serverMSeq } = changes[orgId];
    const clientSeq = syncStore.getSeq(orgId);
    const delta = serverSeq - clientSeq;

    // Phase 1: Remove deleted entities from cache
    for (const entityId of deletedIds) {
      // We don't know the entityType per deleted ID, so remove across all product entity caches
      cacheOps.removeEntityById(entityId);
    }

    // Phase 2: Determine if creates/updates happened
    if (delta > deletedIds.length) {
      // More seq increments than deletes → creates/updates happened
      // Determine priority based on current route context
      const priority = getSyncPriority({
        entityType: 'attachment', // placeholder, priority only checks orgId
        entityId: '',
        organizationId: orgId,
      });

      const refetchType = priority === 'low' ? 'none' : 'active';

      // Invalidate all product entity lists for this org scope
      // The list queries use orgId filtering, so the refetch will only get relevant data
      cacheOps.invalidateAllEntityLists(refetchType);

      console.debug(
        `[CatchupProcessor] Org ${orgId}: delta=${delta}, deletes=${deletedIds.length}, priority=${priority}`,
      );
    } else if (deletedIds.length > 0) {
      console.debug(`[CatchupProcessor] Org ${orgId}: only ${deletedIds.length} deletes`);

      // After removing deleted entities, invalidate affected entity lists
      cacheOps.invalidateAllEntityLists('none');
    }

    // Phase 3: Handle membership changes via mSeq gap
    if (serverMSeq !== undefined) {
      const clientMSeq = syncStore.getSeq(`${orgId}:m`);
      if (serverMSeq > clientMSeq) {
        // Membership changes happened — invalidate all membership-related queries
        membershipOps.invalidateContextList(null);
        membershipOps.invalidateMemberships();
        membershipOps.invalidateMemberQueries(orgId);
        membershipOps.refreshMe();
        console.debug(`[CatchupProcessor] Org ${orgId}: mSeq gap ${clientMSeq}→${serverMSeq} → membership refresh`);
      }
      syncStore.setSeq(`${orgId}:m`, serverMSeq);
    }

    // Phase 4: Update stored seq
    syncStore.setSeq(orgId, serverSeq);
  }
}

/**
 * Process public stream catchup response.
 *
 * For each entityType:
 * 1. Remove deletedIds from cache
 * 2. Compare serverSeq with stored clientSeq
 * 3. If creates/updates detected, invalidate list
 * 4. Update stored seq
 */
export function processPublicCatchup(response: PublicCatchupResponse): void {
  const { changes } = response;
  const syncStore = useSyncStore.getState();
  const scopes = Object.keys(changes);

  if (scopes.length === 0) return;

  console.debug(`[CatchupProcessor] Public catchup: ${scopes.length} entity types`);

  for (const entityType of scopes) {
    const { seq: serverSeq, deletedIds } = changes[entityType];
    const clientSeq = syncStore.getSeq(entityType);
    const delta = serverSeq - clientSeq;

    if (!hasEntityQueryKeys(entityType)) continue;
    const keys = getEntityQueryKeys(entityType);

    // Phase 1: Remove deleted entities from cache
    for (const entityId of deletedIds) {
      cacheOps.removeEntityFromCache(entityType, entityId);
    }

    // Phase 2: Determine if creates/updates happened
    if (delta > deletedIds.length) {
      // Creates/updates → invalidate list for refetch
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(
        `[CatchupProcessor] Public ${entityType}: delta=${delta}, deletes=${deletedIds.length} → list invalidated`,
      );
    } else if (deletedIds.length > 0) {
      // Only deletes → list needs update too (items removed)
      cacheOps.invalidateEntityList(keys, 'all');
      console.debug(`[CatchupProcessor] Public ${entityType}: only ${deletedIds.length} deletes`);
    }

    // Phase 3: Update stored seq
    syncStore.setSeq(entityType, serverSeq);
  }
}
