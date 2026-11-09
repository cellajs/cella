import type { CatchUpMyStreamResponse, ListMyMembershipsResponse } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { meKeys } from '~/modules/me/query';
import { seenKeys } from '~/modules/seen/helpers';
import { type EntityQueryKeys, getEntityQueryKeys, getRegisteredProductEntityTypes, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import * as cacheOps from '~/query/realtime/cache-ops';
import { attachPendingPropagation, enqueueCatchupRange, flushChannelViewNow, resetFetchPrioritizer } from '~/query/realtime/fetch-prioritizer';
import * as membershipOps from '~/query/realtime/membership-ops';
import { invalidateEmbeddingHosts, propagateEmbeddings } from '~/query/realtime/propagation';
import { handleStreamSignal } from '~/query/realtime/signal-handlers';
import { getRouteOrganizationId, getSyncTier, getTenantIdForOrg } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';
import { dayMs } from '~/utils/date-mini';
import { whenVisible } from '~/utils/wait-for';

type PropagationHint = NonNullable<CatchUpMyStreamResponse['organizations'][string]['propagation']>[number];

let refetchTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Arms the start over's refetch for the moment the store holds, at once when it has passed. The moment stays stored
 * until the refetch ran, so the catchup after a reload, a closed tab or a suspended phone arms it again.
 * @returns whether a refetch waits.
 */
function armPendingRefetch(): boolean {
  clearTimeout(refetchTimer);
  const { refetchDueAt } = syncStore.getState();
  if (refetchDueAt === null) return false;
  refetchTimer = setTimeout(() => void refetchSyncedCache(), refetchDueAt - Date.now());
  return true;
}

/**
 * The start over's refetch through the sync tiers: every synced list and detail is marked, so one opened later reads
 * then, and the route organization's lists and the details on screen read now, in a visible tab, or once a hidden tab
 * is shown. Other organizations' lists wait for the background fill or their opening.
 */
async function refetchSyncedCache(): Promise<void> {
  const synced = getRegisteredProductEntityTypes().map(getEntityQueryKeys);
  for (const keys of synced) {
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: keys.detail.base, refetchType: 'none' });
  }
  syncStore.getState().markRefetched();

  await whenVisible();
  const routeOrganizationId = getRouteOrganizationId();
  for (const keys of synced) {
    if (routeOrganizationId) cacheOps.invalidateEntityListForOrg(keys, routeOrganizationId, 'active');
    queryClient.invalidateQueries({ queryKey: keys.detail.base, refetchType: 'active' });
  }
}

/** The `${organizationId}:${entityType}` scopes the last catchup answered `opaque`: every connection marks their lists again. */
const opaqueScopes = new Set<string>();

/** Whether the last catchup answered this scope `opaque`, so the sync service leaves its marked lists to be read when opened. */
export const isOpaqueScope = (organizationId: string, entityType: ProductEntityType): boolean => opaqueScopes.has(`${organizationId}:${entityType}`);

/**
 * Readable views fetch their gap when their frontier advances; other statuses expose no frontier.
 * Cursors advance only after ingestion, invalidation handoff, or an intentional cache-free skip.
 */
export async function processStreamCatchup(response: CatchUpMyStreamResponse): Promise<void> {
  const { organizations, views } = response;
  const syncState = syncStore.getState();
  // Before this device's first catchup its cache holds only what route loaders read: that catchup stores the frontiers as baselines.
  const baselineOnly = syncState.caughtUpAt === null;

  // The widest window of the organizations the answer names: the one audience this client's refetch joins.
  const spreadWindowMs = Math.max(0, ...Object.values(organizations).map((summary) => summary.spreadWindow ?? 0));
  syncState.adoptGeneration(response.generation, spreadWindowMs);
  // Away longer than the activity window, this device may hold rows whose tombstones the server has since removed.
  if (syncState.startOverIfAway(appConfig.retention.activityDays * dayMs)) {
    console.debug('[CatchupProcessor] Away longer than the activity window → cursors reset, synced data refetched');
  }
  const refetchPending = armPendingRefetch();
  syncState.markCaughtUp();
  opaqueScopes.clear();

  if (views.length) {
    if (!baselineOnly) resetFetchPrioritizer();

    for (const answer of views) {
      const { organizationId, entityType } = answer;
      if (!hasEntityQueryKeys(entityType)) continue;
      const viewKey = `${organizationId}:${entityType}`;

      if (answer.status === 'forbidden') {
        console.debug(`[CatchupProcessor] View ${viewKey}: forbidden → dropped`);
        continue;
      }

      const keys = getEntityQueryKeys(entityType);

      if (answer.status === 'opaque') {
        opaqueScopes.add(viewKey);
        // Before the lists refetch, so a list read in flight finds no cursor move to read again.
        const hint = organizations[organizationId]?.propagation?.find(({ embeddedProduct }) => embeddedProduct === entityType);
        if (!baselineOnly && hint) settleOpaqueHint(organizationId, hint, keys);
        // Readable but not provably complete, so no numbers to compare: an actively viewed list refetches, the others stay marked until opened.
        if (!baselineOnly && !refetchPending && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
        }
        console.debug(`[CatchupProcessor] View ${viewKey}: opaque → staleness fallback`);
        continue;
      }

      const frontier = answer.frontier ?? 0;
      const clientCursor = syncState.getOrgSeq(organizationId, entityType);

      // First session for this view: the frontier is the baseline, and a list cached already was read before the stream was live, so it
      // refetches, unless the frontier is 0: no change exists that the read could have missed. A pending start over's refetch covers it.
      if (baselineOnly || clientCursor === 0) {
        if (!refetchPending && frontier > 0 && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
          console.debug(`[CatchupProcessor] View ${viewKey}: first session → full refetch`);
        }
        syncState.setOrgSeq(organizationId, entityType, frontier);
        continue;
      }

      if (frontier <= clientCursor) continue;

      const tenantId = getTenantIdForOrg(organizationId);

      // A connection waits for the bound database's restore, so no list of this scope is on disk either: the next read fetches it whole.
      if (!hasAnyCachedList(keys, organizationId)) {
        syncState.setOrgSeq(organizationId, entityType, frontier);
        console.debug(`[CatchupProcessor] View ${viewKey}: no cached list → skip range fetch`);
        continue;
      }

      // Every gap goes through the fetch prioritizer; the viewing org flushes now and is awaited, so waitForActiveCatchup resolves against a reconciled cache.
      enqueueCatchupRange({
        entityType,
        organizationId,
        tenantId,
        channelId: null,
        afterSeq: clientCursor,
        untilSeq: frontier,
        isCreate: false,
        spreadWindowMs: organizations[organizationId]?.spreadWindow,
      });

      if (getSyncTier(organizationId, null).min > 0) {
        console.debug(`[CatchupProcessor] View ${viewKey}: gap=${frontier - clientCursor} → enqueued`);
        continue;
      }

      const outcome = await flushChannelViewNow(entityType, organizationId, null);
      console.debug(`[CatchupProcessor] View ${viewKey}: gap=${frontier - clientCursor} → ${outcome}`);
    }
  }

  const organizationIds = Object.keys(organizations);
  for (const organizationId of organizationIds) {
    const { signals, propagation } = organizations[organizationId];

    // A version this client has not stored means it missed a live signal: its handler runs once, without a frame.
    for (const [type, version] of Object.entries(signals ?? {})) {
      if (version === syncState.getSignalVersion(organizationId, type)) continue;
      syncState.setSignalVersion(organizationId, type, version);
      if (!baselineOnly) handleStreamSignal({ type, organizationId, subjectId: null }, true);
    }

    // Propagation runs after the range fetch that carries the fresh embedded rows: now for the viewing org, whose flush was awaited above, and at flush for a background org whose range is still pending.
    if (!baselineOnly && propagation?.length) {
      for (const hint of propagation) {
        // More rows changed than a hint names: the host lists refetch, embedded copies included.
        if (hint.overflow) {
          invalidateEmbeddingHosts(hint.embeddedProduct, organizationId);
          continue;
        }
        const pending = hasEntityQueryKeys(hint.embeddedProduct) && attachPendingPropagation(hint.embeddedProduct, organizationId, hint);
        if (!pending) propagateEmbeddings(hint);
      }
    }
  }

  if (baselineOnly) {
    console.debug(`[CatchupProcessor] Baseline: stored cursors for ${views.length} views, ${organizationIds.length} orgs`);
    return;
  }

  const membershipChannelsBefore = membershipChannelKeys();
  membershipOps.invalidateChannelList(null);
  await membershipOps.fetchMemberships();

  // Remove org product caches after membership loss so surviving rows refetch under current permissions; the org prefix covers home and filtered lists.
  const membershipChannelsAfter = membershipChannelKeys();
  const orgsWithLostChannel = new Set(
    [...membershipChannelsBefore].filter((key) => !membershipChannelsAfter.has(key)).map((key) => key.split(':')[0]),
  );
  for (const organizationId of orgsWithLostChannel) {
    for (const entityType of appConfig.productEntityTypes) {
      if (hasEntityQueryKeys(entityType)) {
        queryClient.removeQueries({ queryKey: getEntityQueryKeys(entityType).list.org(organizationId) });
      }
    }
  }

  // Synced-row deltas miss what happened while disconnected, such as other-device seen-marks, so an exact recount re-anchors the counts.
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

/**
 * An opaque scope's embedding hint, which gets no frontier: the cursor moves to the highest position the hint read, so
 * the next hint names only newer rows. Nothing fetched the updated rows, so the host lists refetch and the updated
 * rows' own cached details are marked; the hint's removals still propagate.
 */
function settleOpaqueHint(organizationId: string, { embeddedProduct, update, untilSeq }: PropagationHint, keys: EntityQueryKeys): void {
  if (untilSeq === undefined) return;
  const syncState = syncStore.getState();
  syncState.setOrgSeq(organizationId, embeddedProduct, Math.max(syncState.getOrgSeq(organizationId, embeddedProduct), untilSeq));
  if (update.length === 0) return;
  invalidateEmbeddingHosts(embeddedProduct, organizationId);
  for (const id of update) cacheOps.invalidateEntityDetail(id, keys, 'none');
}

/** Channel identities the caller currently has membership in, as `${organizationId}:${channelId}`. */
function membershipChannelKeys(): Set<string> {
  const data = queryClient.getQueryData<ListMyMembershipsResponse>(meKeys.memberships);
  return new Set((data?.results ?? []).map((membership) => `${membership.organizationId}:${membership.channelId}`));
}

/** Mirrors the patch target of fetchRangeAndPatch: with nothing cached, a range fetch has nothing to patch. */
const hasAnyCachedList = (keys: EntityQueryKeys, organizationId: string): boolean =>
  queryClient.getQueriesData({ queryKey: keys.list.org(organizationId) }).some(([, data]) => data !== undefined);
