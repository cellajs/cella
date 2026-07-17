import type { Actor, ProductEntityType } from 'shared';
import { appConfig, pathHomeId } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { baseDb as db } from '#/db/db';
import { findChannelCountersByKeys, findLatestUserActivityId } from '#/modules/entities/entities-queries';
import { collectSubChannelIds } from '#/modules/entities/helpers/collect-sub-channel-ids';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import { buildPropagationHints } from '#/modules/entities/helpers/propagation-hints';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { resolveViewReadStatus } from '#/permissions/view-read-status';
import type { AppCatchupResponse, CatchupView, CatchupViewAnswer } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

/**
 * Answer client-declared views from per-node summaries. Authorization first
 * (`resolveViewReadStatus` per prefix × entityType): a view is `ok` only when EVERY
 * pair proves unconditional subtree read; any readable-but-unproven pair makes it
 * `opaque` (no numbers), and no read route at all makes it `forbidden`. Summaries for
 * `ok` views come from one channel_counters read over the prefixes' deepest nodes:
 * `highWaters` = per-type max of `hw:{type}`, `counts` = per-type sum of `e:{type}`.
 */
export async function answerCatchupViews(
  memberships: MembershipBaseModel[],
  actor: Actor,
  views: CatchupView[],
): Promise<CatchupViewAnswer[]> {
  if (views.length === 0) return [];

  // Authorize every (prefix, entityType) pair per view.
  const statuses = views.map((view) => {
    let sawOpaque = false;
    let sawOk = false;
    for (const prefix of view.prefixes) {
      for (const entityType of view.entityTypes) {
        const status = resolveViewReadStatus(
          memberships,
          entityType as ProductEntityType,
          view.organizationId,
          actor,
          prefix,
        );
        if (status === 'forbidden') return 'forbidden' as const;
        if (status === 'opaque') sawOpaque = true;
        if (status === 'ok') sawOk = true;
      }
    }
    return sawOpaque || !sawOk ? ('opaque' as const) : ('ok' as const);
  });

  // One counters read for all ok views' nodes (a prefix's deepest segment is its node).
  const nodeKeys = new Set<string>();
  views.forEach((view, i) => {
    if (statuses[i] !== 'ok') return;
    for (const prefix of view.prefixes) nodeKeys.add(pathHomeId(prefix));
  });
  const counterRows = nodeKeys.size > 0 ? await findChannelCountersByKeys(dbCtx, [...nodeKeys]) : [];
  const countersByNode = new Map(counterRows.map((r) => [r.channelKey, parseCounterCounts(r.counts)]));

  return views.map((view, i) => {
    const status = statuses[i];
    if (status !== 'ok') return { key: view.key, status };

    const highWaters: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const prefix of view.prefixes) {
      const parsed = countersByNode.get(pathHomeId(prefix));
      if (!parsed) continue;
      for (const entityType of view.entityTypes) {
        const hw = parsed.highWaters[entityType];
        if (hw !== undefined) highWaters[entityType] = Math.max(highWaters[entityType] ?? 0, hw);
        const count = parsed.entityCounts[entityType];
        if (count !== undefined) counts[entityType] = (counts[entityType] ?? 0) + count;
      }
    }
    return { key: view.key, status, highWaters, counts };
  });
}

/**
 * Build app stream catch-up data with org-level and sub-context counter checks.
 * Entity seqs detect product entity changes; `s:membership` detects membership changes.
 * A null cursor returns baselines and causes client-side membership query invalidation.
 */
export async function appCatchupOp(
  memberships: MembershipBaseModel[],
  cursor?: string,
  seqs?: Record<string, number>,
  actor?: Actor,
  views?: CatchupView[],
): Promise<OperationResult<AppCatchupResponse>> {
  const organizationIds = new Set(memberships.map((m) => m.organizationId));

  // View answers are permission-resolved per prefix, independent of membership-derived
  // org enumeration (elevated readers hold no child memberships but declare views).
  const viewAnswers = actor && views?.length ? await answerCatchupViews(memberships, actor, views) : undefined;

  if (organizationIds.size === 0)
    return { success: true, data: { changes: {}, views: viewAnswers, cursor: cursor ?? null } };

  const organizationIdArray = Array.from(organizationIds);

  // Collect sub-context IDs (e.g., projectId) from memberships for all orgs upfront
  const { byOrg: subChannelIdsByOrg, all: allSubChannelIdSet } = collectSubChannelIds(memberships);
  const allSubChannelIds = [...allSubChannelIdSet];

  // Step 1: single query for all org + sub-context counters.
  const allCounterRows = await findChannelCountersByKeys(dbCtx, [...organizationIdArray, ...allSubChannelIds]);
  const allCounters = new Map(allCounterRows.map((r) => [r.channelKey, r.counts]));

  // Step 2: build changes entries for all orgs; empty entries are pruned later.
  const changes: AppCatchupResponse['changes'] = {};

  for (const organizationId of organizationIdArray) {
    const { entitySeqs, entityCounts } = parseCounterCounts(allCounters.get(organizationId));

    changes[organizationId] = {
      entitySeqs: Object.keys(entitySeqs).length > 0 ? entitySeqs : undefined,
      entityCounts: Object.keys(entityCounts).length > 0 ? entityCounts : undefined,
    };

    // Attach sub-context data
    const channelIds = subChannelIdsByOrg.get(organizationId);
    if (channelIds) {
      const childChannelChanges: Record<
        string,
        { entitySeqs?: Record<string, number>; entityCounts?: Record<string, number> }
      > = {};

      for (const channelId of channelIds) {
        const { entitySeqs: ctxSeqs, entityCounts: ctxCounts } = parseCounterCounts(allCounters.get(channelId));
        if (Object.keys(ctxSeqs).length > 0 || Object.keys(ctxCounts).length > 0) {
          childChannelChanges[channelId] = {
            entitySeqs: Object.keys(ctxSeqs).length > 0 ? ctxSeqs : undefined,
            entityCounts: Object.keys(ctxCounts).length > 0 ? ctxCounts : undefined,
          };
        }
      }

      if (Object.keys(childChannelChanges).length > 0) {
        changes[organizationId].childChannelChanges = childChannelChanges;
      }
    }
  }

  // Step 3: build propagation hints for embedding relationships.
  // Soft-deleted embedded sources are returned as removal hints by seq-delta lookup.
  await buildPropagationHints(changes, seqs);

  // Step 4: prune orgs with no changes.
  if (seqs) {
    for (const [orgId, scope] of Object.entries(changes)) {
      const hasPropagation = scope.propagation && scope.propagation.length > 0;
      const seqsMatch =
        !scope.entitySeqs ||
        Object.entries(scope.entitySeqs).every(([entityType, serverVal]) => {
          return seqs[`${orgId}:s:${entityType}`] === serverVal;
        });

      if (seqsMatch && !hasPropagation) {
        delete changes[orgId];
      }
    }
  }

  // Step 5: advance cursor.
  let newCursor: string | null = cursor ?? null;
  if (!cursor || Object.keys(changes).length > 0) {
    newCursor =
      (await findLatestUserActivityId(dbCtx, Array.from(organizationIds), [
        ...appConfig.productEntityTypes,
        ...appConfig.channelEntityTypes,
      ])) ??
      cursor ??
      null;
  }

  return { success: true, data: { changes, views: viewAnswers, cursor: newCursor } };
}

/**
 * Get the latest activity ID relevant to a user.
 * Used for 'now' offset and as new cursor in catchup responses.
 * Exported for use by stream handler.
 */
export async function getLatestUserActivityId(organizationIds: Set<string>): Promise<string | null> {
  if (organizationIds.size === 0) return null;

  return findLatestUserActivityId(dbCtx, Array.from(organizationIds), [
    ...appConfig.productEntityTypes,
    ...appConfig.channelEntityTypes,
  ]);
}
