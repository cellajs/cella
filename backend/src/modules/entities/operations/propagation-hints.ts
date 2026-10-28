import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantReadAsIncludingDeleted } from '#/db/tenant-context';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import { parseCounterCounts } from '#/modules/entities/helpers/parse-counter-counts';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import type { AppCatchupResponse, CatchupOrganizationSummary, CatchupView } from '#/schemas';
import { getEntityTable } from '#/tables';

/** The embeddings of each embedded product type, from productEmbeddings config. */
const embeddingsByProduct = Map.groupBy(appConfig.productEmbeddings, (embedding) => embedding.embeddedProduct);

/**
 * An embedded product changed when the org's `e:f:{embeddedProduct}` rollup exceeds the client's org-view cursor. The
 * ids come from a delta read in the caller's tenant that keeps the rows the caller may read, as a list does, so a hint
 * names no row the caller cannot fetch; tombstones return as removal hints.
 * @param orgCounters - The counter row of each organization in `organizations`.
 */
export async function buildPropagationHints(
  ctx: UserContext,
  organizations: AppCatchupResponse['organizations'],
  views: CatchupView[] | undefined,
  orgCounters: Map<string, Record<string, number> | null>,
): Promise<void> {
  if (embeddingsByProduct.size === 0 || !views?.length) return;
  const { memberships } = ctx.var;
  const actor = actorFrom(ctx);
  const tenantByOrganization = new Map(memberships.map((membership) => [membership.organizationId, membership.tenantId]));

  // Org-view cursors per (org, embeddedProduct).
  const cursorFor = new Map<string, number>();
  for (const view of views) {
    for (const entityType of view.entityTypes) {
      const key = `${view.organizationId}:${entityType}`;
      cursorFor.set(key, Math.min(cursorFor.get(key) ?? Number.POSITIVE_INFINITY, view.cursor));
    }
  }

  for (const [organizationId, scope] of Object.entries(organizations)) {
    // Without a membership in the organization the caller has no tenant there and reads nothing.
    const tenantId = tenantByOrganization.get(organizationId);
    if (!tenantId) continue;

    const hints: CatchupOrganizationSummary['propagation'] = [];
    const { frontiers } = parseCounterCounts(orgCounters.get(organizationId));

    for (const [embeddedProduct, embeddings] of embeddingsByProduct) {
      const clientCursor = cursorFor.get(`${organizationId}:${embeddedProduct}`);
      // No declared view for this embedded product, or no baseline yet.
      if (clientCursor === undefined || clientCursor === 0) continue;

      const frontier = frontiers[embeddedProduct] ?? 0;
      if (frontier <= clientCursor) continue;

      const readFilter = resolveCollectionReadFilter(memberships, embeddedProduct, organizationId, actor);
      const readWhere = buildCollectionReadWhere(readFilter, getEntityTable(embeddedProduct), embeddedProduct, actor);
      if (readWhere.kind === 'none') continue;

      const { updatedIds, deletedIds } = await tenantReadAsIncludingDeleted(ctx, tenantId, (readCtx) =>
        findChangedEntityDeltaIds(readCtx, {
          entityType: embeddedProduct,
          organizationId,
          afterSeq: clientCursor,
          readWhere: readWhere.kind === 'where' ? readWhere.where : undefined,
        }),
      );
      if (updatedIds.length === 0 && deletedIds.length === 0) continue;

      for (const { hostProduct, hostColumn } of embeddings) {
        hints.push({ embeddedProduct, hostProduct, hostColumn, update: updatedIds, remove: deletedIds });
      }
    }

    if (hints.length > 0) {
      scope.propagation = hints;
    }
  }
}
