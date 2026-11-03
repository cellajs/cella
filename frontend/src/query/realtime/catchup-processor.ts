import type { GetMyMembershipsResponse, PostAppCatchupResponse } from 'sdk';
import { appConfig, isProduct } from 'shared';
import { meKeys } from '~/modules/me/query';
import { seenKeys } from '~/modules/seen/helpers';
import { type EntityQueryKeys, getEntityQueryKeys, getRegisteredProductEntityTypes, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isSyncDeliveryTrusted, setSyncDeliveryTrusted } from '~/query/basic/sync-stale-state';
import { queryClient } from '~/query/query-client';
import * as cacheOps from '~/query/realtime/cache-ops';
import { attachPendingPropagation, enqueueCatchupRange, flushChannelViewNow, resetFetchPrioritizer } from '~/query/realtime/fetch-prioritizer';
import * as membershipOps from '~/query/realtime/membership-ops';
import { propagateEmbeddings } from '~/query/realtime/propagation';
import { handleStreamSignal } from '~/query/realtime/signal-handlers';
import { getSyncTier, getTenantIdForOrg } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';

/** Every client learns of a new generation at about the same moment: each waits a random part of this before it refetches. */
const generationRefetchSpreadMs = 10_000;

const dayMs = 24 * 60 * 60 * 1000;

/** Refetches what is on screen of every synced type and marks the rest stale, after this client's share of the spread. */
function refetchSyncedQueries(): void {
  setTimeout(() => {
    for (const entityType of getRegisteredProductEntityTypes()) cacheOps.invalidateEntityQueries(getEntityQueryKeys(entityType));
  }, Math.random() * generationRefetchSpreadMs);
}

/** The `${organizationId}:${entityType}` scopes the last catchup answered `opaque`: every connection marks their lists again. */
const opaqueScopes = new Set<string>();

/** Whether the last catchup answered this scope `opaque`, so the sync service leaves its marked lists to be read when opened. */
export const isOpaqueScope = (organizationId: string, entityType: string): boolean => opaqueScopes.has(`${organizationId}:${entityType}`);

/**
 * Readable views fetch their gap when their frontier advances; other statuses expose no summaries.
 * Cursors advance only after ingestion, invalidation handoff, or an intentional cache-free skip.
 */
export async function processAppCatchup(response: PostAppCatchupResponse, baselineOnly = false): Promise<void> {
  const { organizations, views } = response;
  const syncState = syncStore.getState();

  const newGeneration = syncState.adoptGeneration(response.generation);
  // Away longer than the activity window, this device may hold rows whose tombstones the server has since removed.
  const awayTooLong = syncState.startOverIfAway(appConfig.retention.activityDays * dayMs);
  if (awayTooLong) console.debug('[CatchupProcessor] Away longer than the activity window → cursors reset, synced data refetched');
  if (newGeneration || awayTooLong) refetchSyncedQueries();
  syncState.markCaughtUp();
  let hadGap = false;
  opaqueScopes.clear();

  if (views?.length) {
    if (!baselineOnly) resetFetchPrioritizer();

    for (const answer of views) {
      // Registered grant-boundary views (views.ts) take precedence over org-view keys.
      if (syncState.getView(answer.key)) {
        if (!baselineOnly) processRegisteredViewAnswer(answer, syncState);
        continue;
      }

      const [organizationId, entityType] = splitViewKey(answer.key);
      if (!organizationId || !isProduct(entityType) || !hasEntityQueryKeys(entityType)) continue;

      if (answer.status === 'forbidden') {
        console.debug(`[CatchupProcessor] View ${answer.key}: forbidden → dropped`);
        continue;
      }

      const keys = getEntityQueryKeys(entityType);

      if (answer.status === 'opaque') {
        opaqueScopes.add(`${organizationId}:${entityType}`);
        // Readable but not provably complete, so no numbers to compare: an actively viewed list refetches, the others stay marked until opened.
        if (!baselineOnly && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
        }
        console.debug(`[CatchupProcessor] View ${answer.key}: opaque → staleness fallback`);
        continue;
      }

      const frontier = answer.frontiers?.[entityType] ?? 0;
      const clientCursor = syncState.getOrgSeq(organizationId, entityType);

      // First session for this view: the frontier is the baseline, and a list cached already was read before the stream was live, so it
      // refetches, unless the frontier is 0: no change exists that the read could have missed.
      if (baselineOnly || clientCursor === 0) {
        if (frontier > 0 && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
          console.debug(`[CatchupProcessor] View ${answer.key}: first session → full refetch`);
        }
        syncState.setOrgSeq(organizationId, entityType, frontier);
        continue;
      }

      if (frontier <= clientCursor) continue;
      hadGap = true;

      const tenantId = getTenantIdForOrg(organizationId);

      // A connection waits for the bound database's restore, so no list of this scope is on disk either: the next read fetches it whole.
      if (!hasAnyCachedList(keys, organizationId)) {
        syncState.setOrgSeq(organizationId, entityType, frontier);
        console.debug(`[CatchupProcessor] View ${answer.key}: no cached list → skip range fetch`);
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
      });

      if (getSyncTier(entityType, organizationId, null).min > 0) {
        console.debug(`[CatchupProcessor] View ${answer.key}: gap=${frontier - clientCursor} → enqueued`);
        continue;
      }

      const outcome = await flushChannelViewNow(entityType, organizationId, null);
      console.debug(`[CatchupProcessor] View ${answer.key}: gap=${frontier - clientCursor} → ${outcome}`);
    }
  }

  // Organization-level signal versions and propagation.
  const organizationIds = Object.keys(organizations);
  for (const organizationId of organizationIds) {
    const { signals, propagation } = organizations[organizationId];

    // Seed the org entry so the next catchup request declares views for it: an organization the membership cache did not hold yet is learned here.
    syncState.trackOrg(organizationId);

    // A version this client has not stored means it missed a live signal: its handler runs once, without a frame.
    for (const [type, version] of Object.entries(signals ?? {})) {
      if (version === syncState.getSignalVersion(organizationId, type)) continue;
      syncState.setSignalVersion(organizationId, type, version);
      if (!baselineOnly) handleStreamSignal({ type, organizationId, subjectId: null, version }, true);
    }

    // Propagation runs after the range fetch that carries the fresh embedded rows: now for the viewing org, whose flush was awaited above, and at flush for a background org whose range is still pending.
    if (!baselineOnly && propagation?.length) {
      for (const hint of propagation) {
        const pending = hasEntityQueryKeys(hint.embeddedProduct) && attachPendingPropagation(hint.embeddedProduct, organizationId, hint);
        if (!pending) propagateEmbeddings(hint);
      }
    }
  }

  if (baselineOnly) {
    console.debug(`[CatchupProcessor] Baseline: stored cursors for ${views?.length ?? 0} views, ${organizationIds.length} orgs`);
    return;
  }

  // Nothing outstanding this cycle: a prior delivery shortfall has been filled, resume trusted mode.
  if (!hadGap && !isSyncDeliveryTrusted()) {
    setSyncDeliveryTrusted(true);
    console.info('[SyncTrust] catchup reconciled; resuming trusted mode');
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

/** Channel identities the caller currently has membership in, as `${organizationId}:${channelId}`. */
function membershipChannelKeys(): Set<string> {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(meKeys.memberships);
  return new Set((data?.items ?? []).map((membership) => `${membership.organizationId}:${membership.channelId}`));
}

/** Grant-boundary answers refine org-view ingestion: unchanged skips work, opaque falls back to staleness, forbidden drops the view. */
function processRegisteredViewAnswer(
  answer: NonNullable<PostAppCatchupResponse['views']>[number],
  syncState: ReturnType<typeof syncStore.getState>,
): void {
  const view = syncState.getView(answer.key);
  if (!view) return;

  if (answer.status === 'forbidden') {
    syncState.removeSyncView(answer.key);
    console.debug(`[CatchupProcessor] View ${answer.key}: forbidden → removed`);
    return;
  }

  const invalidateTypes = () => {
    for (const entityType of view.entityTypes) {
      if (!hasEntityQueryKeys(entityType)) continue;
      const keys = getEntityQueryKeys(entityType);
      if (hasAnyCachedList(keys, view.organizationId)) {
        cacheOps.invalidateEntityListForOrg(keys, view.organizationId, 'active');
      }
    }
  };

  if (answer.status === 'opaque') {
    for (const entityType of view.entityTypes) opaqueScopes.add(`${view.organizationId}:${entityType}`);
    invalidateTypes();
    console.debug(`[CatchupProcessor] View ${answer.key}: opaque → staleness fallback`);
    return;
  }

  const frontier = Math.max(0, ...Object.values(answer.frontiers ?? {}));
  if (view.cursor === 0) {
    // Baseline: adopt frontier; hydration/route loaders supply the data.
    syncState.setViewCursor(answer.key, frontier);
    console.debug(`[CatchupProcessor] View ${answer.key}: baseline → cursor ${frontier}`);
    return;
  }
  if (frontier <= view.cursor) return;

  invalidateTypes();
  syncState.setViewCursor(answer.key, frontier);
  console.debug(`[CatchupProcessor] View ${answer.key}: frontier ${view.cursor} → ${frontier} → invalidated`);
}

/** View keys are `${organizationId}:${entityType}` (see sync-store.getCatchupViews). */
function splitViewKey(key: string): [string | undefined, string | undefined] {
  const separatorIndex = key.lastIndexOf(':');
  if (separatorIndex <= 0) return [undefined, undefined];
  return [key.slice(0, separatorIndex), key.slice(separatorIndex + 1)];
}

/** Mirrors the patch target of fetchRangeAndPatch: with nothing cached, a range fetch has nothing to patch. */
function hasAnyCachedList(keys: EntityQueryKeys, organizationId: string): boolean {
  return queryClient.getQueriesData({ queryKey: keys.list.org(organizationId) }).some(([, data]) => data !== undefined);
}
