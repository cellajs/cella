import { appConfig, type EntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import type { AppCatchupResponse, CatchupChangeSummary, CatchupView } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

type PropagationTarget = { targetType: string; field: string };

/** Source entity type to host entity types that embed it, derived from entityEmbeddings config. */
const propagationTargets: Partial<Record<EntityType, PropagationTarget[]>> = {};
for (const embedding of appConfig.entityEmbeddings) {
  const source = embedding.embeddedEntity as EntityType;
  const targets = propagationTargets[source] ?? [];
  targets.push({ targetType: embedding.hostEntity, field: embedding.hostColumn });
  propagationTargets[source] = targets;
}

/**
 * Build propagation hints for each org's change summary. Ledger-driven: a source
 * type changed for a client when the org's `hw:{sourceType}` rollup exceeds the
 * client's org-view cursor (from the declared views); the changed source ids come
 * from an org-wide `seq > cursor` delta-id read, including soft-delete tombstones
 * (returned as removal hints).
 */
export async function buildPropagationHints(
  changes: AppCatchupResponse['changes'],
  views?: CatchupView[],
  orgCounters?: Map<string, Record<string, number> | null>,
): Promise<void> {
  const sourceTypes = Object.keys(propagationTargets) as EntityType[];
  if (sourceTypes.length === 0 || !views?.length) return;

  // Org-view cursors per (org, sourceType) from the declared views.
  const cursorFor = new Map<string, number>();
  for (const view of views) {
    for (const entityType of view.entityTypes) {
      const key = `${view.organizationId}:${entityType}`;
      cursorFor.set(key, Math.min(cursorFor.get(key) ?? Number.POSITIVE_INFINITY, view.cursor));
    }
  }

  for (const [organizationId, scope] of Object.entries(changes)) {
    const hints: CatchupChangeSummary['propagation'] = [];
    const { highWaters } = parseCounterCounts(orgCounters?.get(organizationId));

    for (const sourceType of sourceTypes) {
      const targets = propagationTargets[sourceType];
      if (!targets?.length) continue;

      const clientCursor = cursorFor.get(`${organizationId}:${sourceType}`);
      // No declared view (source type not synced by this client) or no baseline yet.
      if (clientCursor === undefined || clientCursor === 0) continue;

      const hw = highWaters[sourceType] ?? 0;
      if (hw <= clientCursor) continue;

      const { updatedIds, deletedIds } = await findChangedEntityDeltaIds(
        dbCtx,
        sourceType,
        organizationId,
        clientCursor,
      );

      for (const target of targets) {
        if (updatedIds.length > 0 || deletedIds.length > 0) {
          hints.push({
            sourceType,
            targetType: target.targetType,
            field: target.field,
            update: updatedIds,
            remove: deletedIds,
          });
        }
      }
    }

    if (hints.length > 0) {
      scope.propagation = hints;
    }
  }
}
