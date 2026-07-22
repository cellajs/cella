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
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import { enqueueCatchupRange, flushChannelViewNow, resetFetchPrioritizer } from './fetch-prioritizer';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncTier, getTenantIdForOrg } from './sync-priority';

/**
 * Process the app stream catchup response (view-driven, org sequence).
 *
 * The client declares one view per (org, entityType) with its org-sequence cursor
 * (`sync-store.getCatchupViews`); the server answers `ok` (with `frontiers`/`counts`
 * rollups), `opaque` (readable but not provably all, with no numbers), or `forbidden`.
 * For an `ok` view with `frontier > cursor` ONE org-wide delta fetch from `cursor + 1`
 * returns every changed row in the org for that type (including rows homed in child
 * channels and tombstones), and cache-ops routes them into the right lists. Child-scope
 * watermarks remain live-path bookkeeping; catchup no longer depends on
 * membership-derived channel discovery (the elevated-reader gap this design removes).
 *
 * Catchup guarantees retained by the org-sequence engine:
 * - advance-after-ingest: the org cursor advances only after the window drained (ok),
 *   was handed to react-query (invalidate), or was deliberately skipped (nothing cached)
 * - baseline: cursor 0 stores the frontier and refetches only when something is cached
 * - tier folding: background orgs enqueue into the fetch prioritizer (advance at flush)
 * - counts are compared server-to-server only (in-session change signal)
 */
export async function processAppCatchup(response: PostAppCatchupResponse, baselineOnly = false): Promise<void> {
  const { changes, views } = response;
  const syncStore = useSyncStore.getState();
  let hadGap = false; // any view still behind the server frontier this cycle

  // ── Views: product entity sync per (org, entityType) ──────────────────────
  if (views?.length) {
    if (!baselineOnly) resetFetchPrioritizer();

    for (const answer of views) {
      // Registered grant-boundary views (views.ts) take precedence over org-view keys.
      if (syncStore.getView(answer.key)) {
        if (!baselineOnly) processRegisteredViewAnswer(answer, syncStore);
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
        // Readable but not provably all: no numbers to compare. Fall back to staleness, so
        // an actively viewed list refetches; background lists follow their mount policy.
        if (!baselineOnly && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
        }
        console.debug(`[CatchupProcessor] View ${answer.key}: opaque → staleness fallback`);
        continue;
      }

      const frontier = answer.frontiers?.[entityType] ?? 0;
      const clientCursor = syncStore.getOrgSeq(organizationId, entityType);

      // Baseline (first session for this org view): store the frontier, let route loaders /
      // hydration supply data. With something already cached, refetch it.
      if (baselineOnly || clientCursor === 0) {
        if (!baselineOnly && hasAnyCachedList(keys, organizationId)) {
          cacheOps.invalidateEntityListForOrg(keys, organizationId, 'active');
          console.debug(`[CatchupProcessor] View ${answer.key}: first session → full refetch`);
        }
        syncStore.setOrgSeq(organizationId, entityType, frontier);
        continue;
      }

      if (frontier <= clientCursor) continue; // caught up
      hadGap = true;

      const tenantId = syncStore.getOrgTenantId(organizationId) ?? getTenantIdForOrg(organizationId);

      // Cache-symmetry guard: with nothing cached there is nothing to patch; mount
      // hydration fetches fresh. Advance so the window is not re-offered forever.
      if (!hasAnyCachedList(keys, organizationId)) {
        syncStore.setOrgSeq(organizationId, entityType, frontier);
        console.debug(`[CatchupProcessor] View ${answer.key}: no cached list → skip delta`);
        continue;
      }

      // ONE fetch path: every gap goes through the fetch prioritizer. Background orgs advance at
      // their negotiated flush; the viewing org is flushed immediately AND awaited so the
      // mutation-replay gate (waitForActiveCatchup) resolves against a reconciled cache.
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

    // Integrity: counts compared server-to-server per (org, entityType). A changed
    // count with matching frontier means drift (e.g. failed refetch after invalidation).
    if (!baselineOnly) verifyViewCounts(views);
  }

  // ── Org-level blocks: membership screening + propagation (legacy `changes`) ─
  const orgIds = Object.keys(changes);
  for (const organizationId of orgIds) {
    const { signals, propagation } = changes[organizationId];

    // Seed the org entry so the NEXT catchup request declares views for it (fresh
    // sessions have no stored orgs yet; membership-derived `changes` names them).
    syncStore.setOrgTenantId(organizationId, syncStore.getOrgTenantId(organizationId) ?? '');

    // Membership change via the bump-only membership signal; stored after comparison.
    const serverMembershipSignal = signals?.membership;
    if (serverMembershipSignal !== undefined) {
      const membershipChanged = serverMembershipSignal !== syncStore.getOrgSeq(organizationId, 'membership');
      syncStore.setOrgSeq(organizationId, 'membership', serverMembershipSignal);
      if (membershipChanged && !baselineOnly) membershipOps.invalidateMemberQueries(organizationId);
    }

    // Propagation AFTER delta fetches so fresh source data is in cache.
    if (!baselineOnly && propagation?.length) {
      for (const hint of propagation) {
        propagateEmbeddings(hint);
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

  // Refresh memberships (getMyMemberships, invalidate channel lists, refresh current user).
  const membershipChannelsBefore = membershipChannelKeys();
  membershipOps.invalidateChannelList(null);
  await membershipOps.fetchMemberships();
  membershipOps.refreshMe();

  // Drop product caches for any org where a channel membership vanished (channel deletion or
  // plain removal). Coarse per org: still-visible rows refetch permission-scoped on next
  // mount, detail-by-id self-heals via GC / 403. The org list prefix covers home and filtered
  // lists alike. Runs only on an actual loss, so unchanged catchups touch nothing.
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

  // Reconcile unseen counts. Synced-row deltas cannot see what happened while
  // disconnected (other-device seen-marks, missed windows); an exact recount re-anchors them.
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

/** Channel identities the caller currently has membership in, as `${organizationId}:${channelId}`. */
function membershipChannelKeys(): Set<string> {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(meKeys.memberships);
  return new Set((data?.items ?? []).map((m) => `${m.organizationId}:${m.channelId}`));
}

/** Registered product entity types, for building the catchup views request. */
export function catchupEntityTypes(): string[] {
  return getRegisteredProductEntityTypes();
}

/**
 * Answers for registered grant-boundary views: precise CHANGE DETECTION on top of the
 * org-view correctness baseline. `ok` + unchanged frontier skips every refetch (the win);
 * changed → invalidate the affected active lists and advance the view cursor (row
 * ingestion itself rides org-view delta fetches, with no per-view range fetch here);
 * `opaque` → staleness fallback; `forbidden` → the grant is gone, drop the view.
 */
function processRegisteredViewAnswer(
  answer: NonNullable<PostAppCatchupResponse['views']>[number],
  syncStore: ReturnType<typeof useSyncStore.getState>,
): void {
  const view = syncStore.getView(answer.key);
  if (!view) return;

  if (answer.status === 'forbidden') {
    syncStore.removeSyncView(answer.key);
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
    invalidateTypes();
    console.debug(`[CatchupProcessor] View ${answer.key}: opaque → staleness fallback`);
    return;
  }

  const frontier = Math.max(0, ...Object.values(answer.frontiers ?? {}));
  if (view.cursor === 0) {
    // Baseline: adopt frontier; hydration/route loaders supply the data.
    syncStore.setViewCursor(answer.key, frontier);
    console.debug(`[CatchupProcessor] View ${answer.key}: baseline → cursor ${frontier}`);
    return;
  }
  if (frontier <= view.cursor) return; // unchanged: skip refetches, the precision win

  invalidateTypes();
  syncStore.setViewCursor(answer.key, frontier);
  console.debug(`[CatchupProcessor] View ${answer.key}: frontier ${view.cursor} → ${frontier} → invalidated`);
}

/** View keys are `${organizationId}:${entityType}` (see sync-store.getCatchupViews). */
function splitViewKey(key: string): [string | undefined, string | undefined] {
  const idx = key.lastIndexOf(':');
  if (idx <= 0) return [undefined, undefined];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

/**
 * Whether any list query data is cached under the entity's org prefix (or base for public
 * entities). Mirrors the patch target of fetchRangeAndPatch. When nothing is cached a delta
 * fetch has nothing to patch: mount hydration fetches fresh and resets the cursor itself.
 */
function hasAnyCachedList(keys: ReturnType<typeof getEntityQueryKeys>, organizationId: string | null): boolean {
  const prefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  return queryClient.getQueriesData({ queryKey: prefix }).some(([, data]) => data !== undefined);
}

/**
 * Server counts last seen by THIS session, keyed by `${orgId}:${entityType}`.
 * Counts are compared server-to-server (change signal), never against the client's caches:
 * cached lists are predicate-filtered per user, so equality with shared counts is
 * meaningless (a member who can't see every row would mismatch forever).
 */
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
    console.debug(
      `[CatchupProcessor] Integrity: ${entityType} in org ${organizationId} count changed — ${previous} → ${serverCount} → invalidated`,
    );
  }
}
