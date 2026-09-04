import type { GetMyMembershipsResponse, PostAppCatchupResponse } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { meKeys } from '~/modules/me/query';
import { seenKeys } from '~/modules/seen/helpers';
import {
  getEntityQueryKeys,
  getRegisteredProductEntityTypes,
  hasEntityQueryKeys,
} from '~/query/basic/entity-query-registry';
import { isSyncDeliveryTrusted, setSyncDeliveryTrusted } from '~/query/basic/sync-stale-config';
import { queryClient } from '~/query/query-client';
import { syncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import {
  attachPendingPropagation,
  enqueueCatchupRange,
  flushChannelViewNow,
  resetFetchPrioritizer,
} from './fetch-prioritizer';
import * as membershipOps from './membership-ops';
import { invalidateEmbeddedForHost, propagateEmbeddings } from './propagation';
import { getSyncTier, getTenantIdForOrg } from './sync-priority';

/**
 * Readable views fetch deltas when their frontier advances; other statuses expose no summaries.
 * Cursors advance only after ingestion, invalidation handoff, or an intentional cache-free skip.
 */
export async function processAppCatchup(response: PostAppCatchupResponse, baselineOnly = false): Promise<void> {
  const { changes, views } = response;
  const syncState = syncStore.getState();
  let hadGap = false; // any view still behind the server frontier this cycle

  // ── Views: product entity sync per (org, entityType) ──────────────────────
  if (views?.length) {
    if (!baselineOnly) resetFetchPrioritizer();

    for (const answer of views) {
      // Registered grant-boundary views (views.ts) take precedence over org-view keys.
      if (syncState.getView(answer.key)) {
        if (!baselineOnly) processRegisteredViewAnswer(answer, syncState);
        continue;
      }

      const [organizationId, entityType] = splitViewKey(answer.key);
      if (!organizationId || !entityType || !hasEntityQueryKeys(entityType)) continue;

      if (answer.status === 'forbidden') {
        console.debug(`[CatchupProcessor] View ${answer.key}: forbidden → dropped`);
        continue;
      }

      const keys = getEntityQueryKeys(entityType);

      if (answer.status === 'opaque') {
        // Readable but not provably complete, so no numbers to compare: an actively viewed list refetches, background lists follow their mount policy.
        if (!baselineOnly && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
        }
        if (!baselineOnly) invalidateEmbeddedForHost(entityType, organizationId);
        console.debug(`[CatchupProcessor] View ${answer.key}: opaque → staleness fallback`);
        continue;
      }

      const frontier = answer.frontiers?.[entityType] ?? 0;
      const clientCursor = syncState.getOrgSeq(organizationId, entityType);

      // First session for this org view: store the frontier and let route loaders or hydration supply the data; refetch only what is already cached.
      if (baselineOnly || clientCursor === 0) {
        if (!baselineOnly && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
          console.debug(`[CatchupProcessor] View ${answer.key}: first session → full refetch`);
        }
        if (!baselineOnly) invalidateEmbeddedForHost(entityType, organizationId);
        syncState.setOrgSeq(organizationId, entityType, frontier);
        continue;
      }

      if (frontier <= clientCursor) continue; // caught up
      hadGap = true;

      const tenantId = syncState.getOrgTenantId(organizationId) ?? getTenantIdForOrg(organizationId);

      // Nothing cached means nothing to patch and mount hydration fetches fresh, so advance to stop the window being re-offered forever.
      if (!hasAnyCachedList(keys, organizationId)) {
        // The host's own rows are not cached, but a cached embedded list can still hold their stale aggregates.
        invalidateEmbeddedForHost(entityType, organizationId);
        syncState.setOrgSeq(organizationId, entityType, frontier);
        console.debug(`[CatchupProcessor] View ${answer.key}: no cached list → skip delta`);
        continue;
      }

      // Every gap goes through the fetch prioritizer: background orgs advance at their negotiated flush.
      // The viewing org flushes immediately and is awaited, so waitForActiveCatchup resolves against a reconciled cache.
      enqueueCatchupRange({
        entityType: entityType as ProductEntityType,
        organizationId,
        tenantId,
        channelId: null,
        fromSeq: clientCursor + 1,
        untilSeq: frontier,
        isCreate: false,
      });

      if (getSyncTier(entityType, organizationId, null).min > 0) {
        console.debug(`[CatchupProcessor] View ${answer.key}: delta=${frontier - clientCursor} → enqueued`);
        continue;
      }

      const outcome = await flushChannelViewNow(entityType as ProductEntityType, organizationId, null);
      console.debug(`[CatchupProcessor] View ${answer.key}: delta=${frontier - clientCursor} → ${outcome}`);
    }

    // Counts compared server-to-server per (org, entityType): a changed count with a matching frontier means drift.
    if (!baselineOnly) verifyViewCounts(views);
  }

  // Organization-level membership screening and propagation.
  const orgIds = Object.keys(changes);
  for (const organizationId of orgIds) {
    const { signals, propagation } = changes[organizationId];

    // Seed the org entry so the next catchup request declares views for it; fresh sessions have no stored orgs and learn them from `changes`.
    syncState.setOrgTenantId(organizationId, syncState.getOrgTenantId(organizationId) ?? '');

    // Membership change via the bump-only membership signal; stored after comparison.
    const serverMembershipSignal = signals?.membership;
    if (serverMembershipSignal !== undefined) {
      const membershipChanged = serverMembershipSignal !== syncState.getOrgSeq(organizationId, 'membership');
      syncState.setOrgSeq(organizationId, 'membership', serverMembershipSignal);
      if (membershipChanged && !baselineOnly) membershipOps.invalidateMemberQueries(organizationId);
    }

    // Propagation runs after the delta fetch that carries the fresh embedded rows: now for the viewing org, whose flush was awaited above, and at flush for a background org whose range is still pending.
    if (!baselineOnly && propagation?.length) {
      for (const hint of propagation) {
        const embeddedProduct = hint.embeddedProduct as ProductEntityType;
        const pending =
          hasEntityQueryKeys(embeddedProduct) && attachPendingPropagation(embeddedProduct, organizationId, hint);
        if (!pending) propagateEmbeddings(hint);
      }
    }
  }

  if (baselineOnly) {
    console.debug(`[CatchupProcessor] Baseline: stored cursors for ${views?.length ?? 0} views, ${orgIds.length} orgs`);
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
  membershipOps.refreshMe();

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
  return new Set((data?.items ?? []).map((m) => `${m.organizationId}:${m.channelId}`));
}

export function catchupEntityTypes(): string[] {
  return getRegisteredProductEntityTypes();
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
      invalidateEmbeddedForHost(entityType, view.organizationId);
    }
  };

  if (answer.status === 'opaque') {
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
  if (frontier <= view.cursor) return; // unchanged: skip refetches, the precision win

  invalidateTypes();
  syncState.setViewCursor(answer.key, frontier);
  console.debug(`[CatchupProcessor] View ${answer.key}: frontier ${view.cursor} → ${frontier} → invalidated`);
}

/** View keys are `${organizationId}:${entityType}` (see sync-store.getCatchupViews). */
function splitViewKey(key: string): [string | undefined, string | undefined] {
  const idx = key.lastIndexOf(':');
  if (idx <= 0) return [undefined, undefined];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

/** Mirrors the patch target of fetchRangeAndPatch: with nothing cached a delta fetch has nothing to patch, and mount hydration resets the cursor itself. */
function hasAnyCachedList(keys: ReturnType<typeof getEntityQueryKeys>, organizationId: string | null): boolean {
  const prefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  return queryClient.getQueriesData({ queryKey: prefix }).some(([, data]) => data !== undefined);
}

/** Compare per-session server counts only with later server counts, never permission-filtered caches. */
const lastSeenServerCounts = new Map<string, number>();

/** In-session count drift check per ok view; first sight records without comparing. */
function verifyViewCounts(views: NonNullable<PostAppCatchupResponse['views']>): void {
  for (const answer of views) {
    if (answer.status !== 'ok' || !answer.counts) continue;
    const [organizationId, entityType] = splitViewKey(answer.key);
    if (!organizationId || !entityType || !hasEntityQueryKeys(entityType)) continue;

    const serverCount = answer.counts[entityType];
    if (serverCount === undefined) continue;

    const countKey = `${organizationId}:${entityType}`;
    const previous = lastSeenServerCounts.get(countKey);
    lastSeenServerCounts.set(countKey, serverCount);
    if (previous === undefined || previous === serverCount) continue;

    const keys = getEntityQueryKeys(entityType);
    if (!hasAnyCachedList(keys, organizationId)) continue;

    cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
    invalidateEmbeddedForHost(entityType, organizationId);
    console.debug(
      `[CatchupProcessor] Integrity: ${entityType} in org ${organizationId} count changed from ${previous} → ${serverCount} → invalidated`,
    );
  }
}
