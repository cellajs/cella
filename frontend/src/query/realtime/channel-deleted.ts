import type { GetMyMembershipsResponse, StreamSignal } from 'sdk';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { meKeys } from '~/modules/me/query';
import { isSeenTracked, seenKeys } from '~/modules/seen/helpers';
import { resolveHomeChannelId } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys, getRegisteredProductEntityTypes, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { forEachListQuery, getQueryItems } from '~/query/basic/mutate-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import { isOpaqueScope } from '~/query/realtime/catchup-processor';
import { invalidateUndelivered } from '~/query/realtime/fetch-prioritizer';
import * as membershipOps from '~/query/realtime/membership-ops';
import { invalidateEmbeddingHosts } from '~/query/realtime/propagation';
import { publishChangeEvent } from '~/query/realtime/sync-events';
import { syncStore } from '~/query/realtime/sync-store';

/** The organization's refetches wait this long for the rest of a cascade: a delete reaches the channels below it, each with a signal of its own. */
const cascadeSettleMs = 1_000;

/** Per organization, the channels deleted since the last refetch; null for a delete missed while away. */
const pendingRefetches = new Map<string, Set<string | null>>();
/** The organizations whose missed delete arrived while a start-over refetch was due, which loads every synced list. */
const coveredByStartOver = new Set<string>();
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

const channelTypesBelowOrganization = () => hierarchy.channelTypes.filter((type) => type !== 'organization');

/** The id columns of the channels below the organization that a product row names in its ancestor chain. */
const channelColumnsOf = (productType: ProductEntityType) =>
  hierarchy
    .getOrderedAncestors(productType)
    .filter((type) => type !== 'organization')
    .map((type) => appConfig.entityIdColumnKeys[type]);

/** Drops the cached rows below a deleted channel from lists and details, each announced as a delete, and the channel's own entries. */
function dropChannel(organizationId: string, channelId: string): void {
  for (const productType of getRegisteredProductEntityTypes()) {
    const columns = channelColumnsOf(productType);
    if (columns.length === 0) continue;

    const keys = getEntityQueryKeys(productType);
    const below = new Map<string, ItemData>();
    const collect = (row: ItemData) => {
      if (columns.some((column) => asRecord(row)[column] === channelId)) below.set(row.id, row);
    };
    forEachListQuery(keys.list.base, (_, data) => {
      for (const row of getQueryItems(data)) collect(row);
    });
    for (const [, detail] of queryClient.getQueriesData<ItemData>({ queryKey: keys.detail.base })) if (detail) collect(detail);
    if (below.size === 0) continue;

    cacheRemove(keys.list.base, [...below.values()]);
    removeDetailQueriesOnceUnobserved(queryClient, keys.detail.base, below.keys());
    for (const row of below.values()) {
      const homeChannelId = resolveHomeChannelId(productType, row);
      publishChangeEvent({ action: 'delete', entityType: productType, organizationId, channelId: homeChannelId, subjectId: row.id });
    }
  }

  // Ids are unique across tables: only the deleted channel's own type holds this one.
  for (const channelType of channelTypesBelowOrganization()) {
    if (!hasEntityQueryKeys(channelType)) continue;
    const keys = getEntityQueryKeys(channelType);
    cacheRemove(keys.list.base, [{ id: channelId }]);
    removeDetailQueriesOnceUnobserved(queryClient, keys.detail.base, [channelId]);
  }
}

/** Marks the lists below every channel of each pending organization, once for the whole cascade. */
function refetchBelowDeletedChannels(): void {
  refetchTimer = null;
  const productTypes = getRegisteredProductEntityTypes().filter((type) => channelColumnsOf(type).length > 0);
  const deletedIds = new Set<string>();

  for (const [organizationId, channelIds] of pendingRefetches) {
    // Missed while away and nothing else: a due start-over refetch loads every list and host, and the catchup that
    // reported it already refetched the lists of an opaque scope.
    const missedOnly = [...channelIds].every((channelId) => channelId === null);
    const startOverCovers = missedOnly && coveredByStartOver.has(organizationId);
    for (const productType of startOverCovers ? [] : productTypes) {
      invalidateEmbeddingHosts(productType, organizationId);
      if (missedOnly && isOpaqueScope(organizationId, productType)) continue;
      invalidateUndelivered(productType, organizationId, [...channelIds], false);
    }
    // The channels' memberships and invitations left by the same cascade.
    membershipOps.invalidateMemberQueries(organizationId);
    for (const channelId of channelIds) if (channelId) deletedIds.add(channelId);
  }
  pendingRefetches.clear();
  coveredByStartOver.clear();

  // A delete missed while away leaves the unseen recount and the memberships to the catchup that reported it.
  if (deletedIds.size > 0 && productTypes.some(isSeenTracked)) queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
  const memberships = queryClient.getQueryData<GetMyMembershipsResponse>(meKeys.memberships)?.items ?? [];
  if (memberships.some(({ channelId }) => deletedIds.has(channelId))) membershipOps.invalidateMemberships();
}

/** Drops what is cached below a deleted channel at once, then refetches below every channel of its organization; missed while away, it only refetches. */
export function handleChannelDeleted({ organizationId, subjectId }: StreamSignal): void {
  if (!organizationId) return;
  if (subjectId) dropChannel(organizationId, subjectId);
  // Read now: the start-over refetch may run, and clear its moment, before the cascade settles.
  else if (syncStore.getState().refetchDueAt !== null) coveredByStartOver.add(organizationId);

  const pending = pendingRefetches.get(organizationId) ?? new Set();
  pendingRefetches.set(organizationId, pending.add(subjectId));
  refetchTimer ??= setTimeout(refetchBelowDeletedChannels, cascadeSettleMs);
}
