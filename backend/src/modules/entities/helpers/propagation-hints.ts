/**
 * Propagation hints for embedding relationships.
 *
 * Derived from `appConfig.entityEmbeddings` at module init. When a source entity
 * type changes (seq delta, including soft-delete tombstones), hints tell the client which host entity
 * types need to refetch their embedded data.
 */

import { appConfig, type EntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import type { AppCatchupResponse, CatchupChangeSummary } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

type PropagationTarget = { targetType: string; field: string };

/** Source entity type → host entity types that embed it (derived from entityEmbeddings config). */
const propagationTargets: Partial<Record<EntityType, PropagationTarget[]>> = {};
for (const embedding of appConfig.entityEmbeddings) {
  const source = embedding.embeddedEntity as EntityType;
  const targets = propagationTargets[source] ?? [];
  targets.push({ targetType: embedding.hostEntity, field: embedding.hostColumn });
  propagationTargets[source] = targets;
}

/**
 * Build propagation hints for each org's change summary.
 * Checks propagationTargets config to find source entity types that changed,
 * then queries changed IDs (lightweight ID-only SELECT) and attaches hints.
 */
export async function buildPropagationHints(
  changes: AppCatchupResponse['changes'],
  clientSeqs?: Record<string, number>,
): Promise<void> {
  const sourceTypes = Object.keys(propagationTargets) as EntityType[];
  if (sourceTypes.length === 0) return;

  for (const [organizationId, scope] of Object.entries(changes)) {
    const hints: CatchupChangeSummary['propagation'] = [];

    for (const sourceType of sourceTypes) {
      const targets = propagationTargets[sourceType];
      if (!targets?.length) continue;

      const serverSeq = scope.entitySeqs?.[sourceType];
      const clientSeq = clientSeqs?.[`${organizationId}:s:${sourceType}`] ?? 0;
      const seqDelta = (serverSeq ?? 0) - clientSeq;

      if (seqDelta <= 0) continue;

      let updatedIds: string[] = [];
      let deletedIds: string[] = [];
      if (seqDelta > 0 && clientSeq > 0) {
        const changes = await findChangedEntityDeltaIds(dbCtx, sourceType, organizationId, clientSeq);
        updatedIds = changes.updatedIds;
        deletedIds = changes.deletedIds;
      }

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
