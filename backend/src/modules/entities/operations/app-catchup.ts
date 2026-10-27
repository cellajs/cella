import type { z } from '@hono/zod-openapi';
import { appConfig, type PredicateActor, pathHomeId } from 'shared';
import type { DbContext, UserContext } from '#/core/context';
import { findChannelCountersByKeys, findLatestActivityId, findSyncGeneration } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import { buildPropagationHints } from '#/modules/entities/operations/propagation-hints';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { actorFrom } from '#/permissions/access';
import { resolveViewReadStatus } from '#/permissions/view-read-status';
import type { AppCatchupResponse, CatchupView, CatchupViewAnswer, streamCatchupBodySchema } from '#/schemas';

/** The most channel nodes one catchup reads summaries for; the nodes past it are proven by id alone. */
const maxSummaryNodes = 1024;

/** A view's depth: `subtree` when it names none. */
function depthOf(view: CatchupView) {
  return view.depth ?? 'subtree';
}

/**
 * Authorization runs first, per (prefix, entityType): `ok` only when every pair proves
 * unconditional subtree read, `opaque` (no numbers) when readable but unproven, `forbidden` with
 * no read route. Summaries come from one channel_counters read over the prefixes' deepest nodes.
 */
export async function answerCatchupViews(
  ctx: DbContext,
  memberships: MembershipBaseModel[],
  actor: PredicateActor,
  views: CatchupView[],
): Promise<CatchupViewAnswer[]> {
  if (views.length === 0) return [];

  // Read before classification so ancestry comes from stored node identity.
  const nodeKeys = new Set<string>();
  for (const view of views) {
    for (const prefix of view.prefixes) {
      if (nodeKeys.size >= maxSummaryNodes) break;
      nodeKeys.add(pathHomeId(prefix));
    }
  }
  const counterRows = nodeKeys.size > 0 ? await findChannelCountersByKeys(ctx, { keys: [...nodeKeys] }) : [];
  const countersByNode = new Map(counterRows.map((row) => [row.channelKey, { ...parseCounterCounts(row.counts), path: row.path }]));

  // Authorize each pair at the view's depth, against the verified path when the row has one.
  const statuses = views.map((view) => {
    let sawOpaque = false;
    let sawOk = false;
    for (const prefix of view.prefixes) {
      const truePath = countersByNode.get(pathHomeId(prefix))?.path;
      for (const entityType of view.entityTypes) {
        const status = resolveViewReadStatus(memberships, entityType, view.organizationId, actor, prefix, depthOf(view), truePath);
        if (status === 'forbidden') return 'forbidden' as const;
        if (status === 'opaque') sawOpaque = true;
        if (status === 'ok') sawOk = true;
      }
    }
    return sawOpaque || !sawOk ? ('opaque' as const) : ('ok' as const);
  });

  return views.map((view, index) => {
    const status = statuses[index];
    if (status !== 'ok') return { key: view.key, status };

    const self = depthOf(view) === 'self';
    const frontiers: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const prefix of view.prefixes) {
      const parsed = countersByNode.get(pathHomeId(prefix));
      if (!parsed) continue;
      for (const entityType of view.entityTypes) {
        // Family per depth: subtree rollups (e:f:, e:c:) or self summaries (e:f:h:, e:c:h:).
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
 * Product entity sync is answered per client-declared view by `answerCatchupViews`; the per-org
 * `changes` block carries the membership signal and embedding propagation hints. A null cursor
 * returns baselines, which the client stores without fetching.
 */
export async function appCatchupOp(ctx: UserContext, { cursor, views }: z.infer<typeof streamCatchupBodySchema>): Promise<AppCatchupResponse> {
  const { memberships } = ctx.var;
  const organizationIds = new Set(memberships.map((membership) => membership.organizationId));

  // View answers resolve per prefix: an elevated reader holds no child memberships but declares views.
  const viewAnswers = views?.length ? await answerCatchupViews(ctx, memberships, actorFrom(ctx), views) : undefined;

  const generation = await findSyncGeneration(ctx);

  if (organizationIds.size === 0) return { changes: {}, views: viewAnswers, cursor: cursor ?? null, generation };

  const organizationIdArray = Array.from(organizationIds);

  // One query for all org counter rows: membership signal plus frontier rollups for hints.
  const allCounterRows = await findChannelCountersByKeys(ctx, { keys: organizationIdArray });
  const allCounters = new Map(allCounterRows.map((row) => [row.channelKey, row.counts]));

  const changes: AppCatchupResponse['changes'] = {};
  for (const organizationId of organizationIdArray) {
    const { membership } = parseCounterCounts(allCounters.get(organizationId));
    changes[organizationId] = { signals: membership !== undefined ? { membership } : undefined };
  }

  // Embedding propagation hints: frontiers vs the client's org-view cursors.
  await buildPropagationHints(ctx, changes, views, allCounters);

  const newCursor = (await getLatestActivityId(ctx, organizationIds)) ?? cursor ?? null;

  return { changes, views: viewAnswers, cursor: newCursor, generation };
}

/**
 * The newest activity of the organizations' products, channels and memberships: the stream's first `offset` and the
 * catchup's new cursor.
 * @returns Its id, or null without organizations or activity.
 */
export async function getLatestActivityId(ctx: DbContext, organizationIds: Set<string>): Promise<string | null> {
  if (organizationIds.size === 0) return null;

  return findLatestActivityId(ctx, {
    organizationIds: Array.from(organizationIds),
    entityTypes: [...appConfig.productEntityTypes, ...appConfig.channelEntityTypes],
  });
}
