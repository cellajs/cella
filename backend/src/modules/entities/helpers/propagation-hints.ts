import { appConfig, type ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import type { AppCatchupResponse, CatchupChangeSummary, CatchupView } from '#/schemas';

const dbCtx: DbContext = { var: { db } };

type EmbeddingHost = { hostProduct: ProductEntityType; hostColumn: string };

/** Embedded product type to the host products that embed it, derived from productEmbeddings config. */
const hostsByEmbeddedProduct: Partial<Record<ProductEntityType, EmbeddingHost[]>> = {};
for (const embedding of appConfig.productEmbeddings) {
  const hosts = hostsByEmbeddedProduct[embedding.embeddedProduct] ?? [];
  hosts.push({ hostProduct: embedding.hostProduct, hostColumn: embedding.hostColumn });
  hostsByEmbeddedProduct[embedding.embeddedProduct] = hosts;
}

/**
 * Build propagation hints for each org's change summary. Sequence-driven: an embedded
 * product changed for a client when the org's `e:f:{embeddedProduct}` rollup exceeds the
 * client's org-view cursor (from the declared views); the changed product ids come
 * from an org-wide `seq > cursor` delta-id read, including soft-delete tombstones
 * (returned as removal hints).
 */
export async function buildPropagationHints(
  changes: AppCatchupResponse['changes'],
  views?: CatchupView[],
  orgCounters?: Map<string, Record<string, number> | null>,
): Promise<void> {
  const embeddedProducts = Object.keys(hostsByEmbeddedProduct) as ProductEntityType[];
  if (embeddedProducts.length === 0 || !views?.length) return;

  // Org-view cursors per (org, embeddedProduct) from the declared views.
  const cursorFor = new Map<string, number>();
  for (const view of views) {
    for (const entityType of view.entityTypes) {
      const key = `${view.organizationId}:${entityType}`;
      cursorFor.set(key, Math.min(cursorFor.get(key) ?? Number.POSITIVE_INFINITY, view.cursor));
    }
  }

  for (const [organizationId, scope] of Object.entries(changes)) {
    const hints: CatchupChangeSummary['propagation'] = [];
    const { frontiers } = parseCounterCounts(orgCounters?.get(organizationId));

    for (const embeddedProduct of embeddedProducts) {
      const hosts = hostsByEmbeddedProduct[embeddedProduct];
      if (!hosts?.length) continue;

      const clientCursor = cursorFor.get(`${organizationId}:${embeddedProduct}`);
      // No declared view (embedded product not synced by this client) or no baseline yet.
      if (clientCursor === undefined || clientCursor === 0) continue;

      const frontier = frontiers[embeddedProduct] ?? 0;
      if (frontier <= clientCursor) continue;

      const { updatedIds, deletedIds } = await findChangedEntityDeltaIds(
        dbCtx,
        embeddedProduct,
        organizationId,
        clientCursor,
      );

      for (const host of hosts) {
        if (updatedIds.length > 0 || deletedIds.length > 0) {
          hints.push({
            embeddedProduct,
            hostProduct: host.hostProduct,
            hostColumn: host.hostColumn,
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
