import type { Actor, ProductEntityType } from 'shared';
import { appConfig, pathHomeId } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { baseDb as db } from '#/db/db';
import { findChannelCountersByKeys, findLatestUserActivityId } from '#/modules/entities/entities-queries';
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
 * `frontiers` = per-type max of `e:f:{type}`, `counts` = per-type sum of `e:c:{type}`.
 */
export async function answerCatchupViews(
  memberships: MembershipBaseModel[],
  actor: Actor,
  views: CatchupView[],
): Promise<CatchupViewAnswer[]> {
  if (views.length === 0) return [];

  // Read paths and counters before classification so ancestry comes from stored node identity.
  // Schema and hard caps bound the query; overflow nodes fall back to conservative ID-only proof.
  const nodeKeys = new Set<string>();
  for (const view of views) {
    for (const prefix of view.prefixes) {
      if (nodeKeys.size >= 1024) break;
      nodeKeys.add(pathHomeId(prefix));
    }
  }
  const counterRows = nodeKeys.size > 0 ? await findChannelCountersByKeys(dbCtx, [...nodeKeys]) : [];
  const countersByNode = new Map(
    counterRows.map((r) => [r.channelKey, { ...parseCounterCounts(r.counts), path: r.path }]),
  );

  // Authorize every (prefix, entityType) pair per view, at the view's depth, against
  // the verified path when the counters row has one.
  const statuses = views.map((view) => {
    let sawOpaque = false;
    let sawOk = false;
    for (const prefix of view.prefixes) {
      const truePath = countersByNode.get(pathHomeId(prefix))?.path;
      for (const entityType of view.entityTypes) {
        const status = resolveViewReadStatus(
          memberships,
          entityType as ProductEntityType,
          view.organizationId,
          actor,
          prefix,
          view.depth ?? 'subtree',
          truePath,
        );
        if (status === 'forbidden') return 'forbidden' as const;
        if (status === 'opaque') sawOpaque = true;
        if (status === 'ok') sawOk = true;
      }
    }
    return sawOpaque || !sawOk ? ('opaque' as const) : ('ok' as const);
  });

  return views.map((view, i) => {
    const status = statuses[i];
    if (status !== 'ok') return { key: view.key, status };

    const self = (view.depth ?? 'subtree') === 'self';
    const frontiers: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const prefix of view.prefixes) {
      const parsed = countersByNode.get(pathHomeId(prefix));
      if (!parsed) continue;
      for (const entityType of view.entityTypes) {
        // Family per depth: subtree rollups (f:/e:) or self summaries (fs:/es:).
        const frontier = self ? parsed.selfFrontiers[entityType] : parsed.frontiers[entityType];
        if (frontier !== undefined) frontiers[entityType] = Math.max(frontiers[entityType] ?? 0, frontier);
        const count = self ? parsed.selfCounts[entityType] : parsed.entityCounts[entityType];
        if (count !== undefined) counts[entityType] = (counts[entityType] ?? 0) + count;
      }
    }
    return { key: view.key, status, frontiers, counts };
  });
}

/**
 * Build app stream catch-up data (sequence sync).
 *
 * Product entity sync is answered per client-declared VIEW (`answerCatchupViews`,
 * prefix-authorized, from `f:`/`e:` rollups). The per-org `changes` block carries the
 * remaining org-level concerns: the `membership` change signal (membership change
 * detection) and embedding propagation hints derived from the views' sequence cursors.
 * A null cursor returns baselines and causes client-side membership query invalidation.
 */
export async function appCatchupOp(
  memberships: MembershipBaseModel[],
  cursor?: string,
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

  // One query for all org counter rows (membership signal + frontier rollups for hints).
  const allCounterRows = await findChannelCountersByKeys(dbCtx, organizationIdArray);
  const allCounters = new Map(allCounterRows.map((r) => [r.channelKey, r.counts]));

  const changes: AppCatchupResponse['changes'] = {};
  for (const organizationId of organizationIdArray) {
    const { membership } = parseCounterCounts(allCounters.get(organizationId));
    changes[organizationId] = {
      signals: membership !== undefined ? { membership } : undefined,
    };
  }

  // Embedding propagation hints: frontiers vs the client's org-view cursors.
  await buildPropagationHints(changes, views, allCounters);

  // Advance cursor.
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
