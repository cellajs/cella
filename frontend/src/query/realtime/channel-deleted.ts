import type { ListMyMembershipsResponse, StreamSignal } from 'sdk';
import { type EntityType, hierarchy, isSeenTracked } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { meKeys } from '~/modules/me/query';
import { seenKeys } from '~/modules/seen/helpers';
import { resolveHomeChannelId } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys, getRegisteredProductEntityTypes, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { forEachListQuery, getQueryItems } from '~/query/basic/mutate-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import { invalidateUndelivered } from '~/query/realtime/fetch-prioritizer';
import * as membershipOps from '~/query/realtime/membership-ops';
import { invalidateEmbeddingHosts } from '~/query/realtime/propagation';
import { publishChangeEvent } from '~/query/realtime/sync-events';
import { syncStore } from '~/query/realtime/sync-store';

/** The product types a channel below the organization may hold: those with an ancestor under it. */
const productTypesBelowChannels = () =>
  getRegisteredProductEntityTypes().filter((type) => hierarchy.getOrderedAncestors(type).some((ancestor) => ancestor !== 'organization'));

/** Removes the cached rows of `entityType` at or inside `channelId` from its lists and details, and returns them. */
function removeAtOrInside(entityType: EntityType, channelId: string): ItemData[] {
  const keys = getEntityQueryKeys(entityType);
  const found = new Map<string, ItemData>();
  const collect = (row: ItemData) => {
    if (hierarchy.isAtOrInside(entityType, asRecord(row), channelId)) found.set(row.id, row);
  };
  forEachListQuery(keys.list.base, (_, data) => {
    for (const row of getQueryItems(data)) collect(row);
  });
  for (const [, detail] of queryClient.getQueriesData<ItemData>({ queryKey: keys.detail.base })) if (detail) collect(detail);
  if (found.size === 0) return [];

  cacheRemove(keys.list.base, [...found.values()]);
  removeDetailQueriesOnceUnobserved(queryClient, keys.detail.base, found.keys());
  return [...found.values()];
}

/**
 * Drops the cached channels at or inside a deleted channel and the product rows below them, each product announced as
 * a delete. The whole subtree goes in this one pass: a cascade sends one signal, for its root.
 * @returns The ids of the channels it dropped.
 */
function dropChannel(organizationId: string, channelId: string): Set<string> {
  for (const productType of productTypesBelowChannels()) {
    for (const row of removeAtOrInside(productType, channelId)) {
      const homeChannelId = resolveHomeChannelId(productType, row);
      publishChangeEvent({ action: 'delete', entityType: productType, organizationId, channelId: homeChannelId, subjectId: row.id });
    }
  }

  const droppedIds = new Set([channelId]);
  for (const channelType of hierarchy.channelTypes) {
    if (channelType === 'organization' || !hasEntityQueryKeys(channelType)) continue;
    for (const row of removeAtOrInside(channelType, channelId)) droppedIds.add(row.id);
  }
  return droppedIds;
}

/**
 * Drops what is cached at and below a deleted channel, then marks the organization's lists of every type a channel
 * holds, which also count rows never cached. Missed while away, it names no channel: only the marks run, and none
 * when a start-over refetch is due, which loads every synced list.
 */
export function handleChannelDeleted({ organizationId, subjectId }: StreamSignal): void {
  if (!organizationId) return;
  const droppedIds = subjectId ? dropChannel(organizationId, subjectId) : new Set<string>();

  // The channels' memberships and invitations left by the same cascade.
  membershipOps.invalidateMemberQueries(organizationId);
  if (!subjectId && syncStore.getState().refetchDueAt !== null) return;

  const productTypes = productTypesBelowChannels();
  for (const productType of productTypes) {
    invalidateEmbeddingHosts(productType, organizationId);
    invalidateUndelivered(productType, organizationId, [subjectId ?? null], false);
  }

  // A delete missed while away leaves the unseen recount and the memberships to the catchup that reported it.
  if (droppedIds.size === 0) return;
  if (productTypes.some(isSeenTracked)) queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
  const memberships = queryClient.getQueryData<ListMyMembershipsResponse>(meKeys.memberships)?.results ?? [];
  if (memberships.some(({ channelId }) => droppedIds.has(channelId))) membershipOps.invalidateMemberships();
}
