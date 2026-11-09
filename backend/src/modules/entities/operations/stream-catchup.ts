import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { findChannelCountersByKeys, findSyncGeneration } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import { buildPropagationHints } from '#/modules/entities/operations/propagation-hints';
import { computeSpreadWindow } from '#/modules/entities/stream/subscriber-manager';
import { accessFrom } from '#/permissions/access';
import { resolveViewReadStatus } from '#/permissions/view-read-status';
import type { StreamCatchupResponse, streamCatchupBodySchema } from '#/schemas';

/**
 * Answers each declared view from its organization's counter row: authorization runs first, `ok` carries the
 * organization's frontier of the type, `opaque` and `forbidden` no number. The per-org `organizations` block carries
 * the versions of the versioned signals and embedding propagation hints.
 */
export async function streamCatchupOp(ctx: UserContext, { views = [] }: z.infer<typeof streamCatchupBodySchema>): Promise<StreamCatchupResponse> {
  const { memberships } = ctx.var;
  const access = accessFrom(ctx);
  const organizationIds = [...new Set(memberships.map((membership) => membership.organizationId))];

  // One read of the counter rows: a system admin may declare views on organizations it holds no membership in.
  const keys = [...new Set([...organizationIds, ...views.map((view) => view.organizationId)])];
  const counterRows = keys.length > 0 ? await findChannelCountersByKeys(ctx, { keys }) : [];
  const counters = new Map(counterRows.map((row) => [row.channelKey, parseCounterCounts(row.counts)]));

  const viewAnswers = views.map(({ organizationId, entityType }) => {
    const status = resolveViewReadStatus(access, entityType, organizationId);
    if (status !== 'ok') return { organizationId, entityType, status };
    return { organizationId, entityType, status, frontier: counters.get(organizationId)?.frontiers[entityType] };
  });

  const generation = await findSyncGeneration(ctx);

  const organizations: StreamCatchupResponse['organizations'] = {};
  for (const organizationId of organizationIds) {
    const signals = counters.get(organizationId)?.signals ?? {};
    organizations[organizationId] = {
      signals: Object.keys(signals).length > 0 ? signals : undefined,
      spreadWindow: computeSpreadWindow(organizationId),
    };
  }

  await buildPropagationHints(ctx, organizations, views, counters);

  return { organizations, views: viewAnswers, generation };
}
