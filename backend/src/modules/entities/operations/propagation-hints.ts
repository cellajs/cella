import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantReadAsIncludingDeleted } from '#/db/tenant-context';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import { accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import type { AppCatchupResponse, CatchupOrganizationSummary, CatchupView } from '#/schemas';
import { getEntityTable } from '#/tables';

/** The product types productEmbeddings config embeds in a host, each once however many hosts embed it. */
const embeddedProducts = new Set(appConfig.productEmbeddings.map(({ embeddedProduct }) => embeddedProduct));

/** The most changed rows one hint names, as many as one range read returns: past it the hint names none, and the client refetches the host lists. */
export const maxHintRows = 1000;

/**
 * An embedded product changed when the org's `e:f:{embeddedProduct}` frontier exceeds the client's org-view cursor:
 * the organization gets one hint for it. The ids come from a delta read in the caller's tenant that keeps the rows the
 * caller may read, as a list does, so a hint names no row the caller cannot fetch; tombstones return as removal hints.
 * @param orgCounters - The parsed counter row of each organization in `organizations`.
 */
export async function buildPropagationHints(
  ctx: UserContext,
  organizations: AppCatchupResponse['organizations'],
  views: CatchupView[],
  orgCounters: Map<string, { frontiers: Record<string, number> }>,
): Promise<void> {
  if (embeddedProducts.size === 0 || views.length === 0) return;
  const { memberships } = ctx.var;
  const access = accessFrom(ctx);
  const tenantByOrganization = new Map(memberships.map((membership) => [membership.organizationId, membership.tenantId]));

  // Org-view cursors per (org, embeddedProduct).
  const cursorFor = new Map<string, number>();
  for (const { organizationId, entityType, cursor } of views) {
    const key = `${organizationId}:${entityType}`;
    cursorFor.set(key, Math.min(cursorFor.get(key) ?? Number.POSITIVE_INFINITY, cursor));
  }

  for (const [organizationId, scope] of Object.entries(organizations)) {
    // Without a membership in the organization the caller has no tenant there and reads nothing.
    const tenantId = tenantByOrganization.get(organizationId);
    if (!tenantId) continue;

    const hints: CatchupOrganizationSummary['propagation'] = [];
    const frontiers = orgCounters.get(organizationId)?.frontiers ?? {};

    for (const embeddedProduct of embeddedProducts) {
      const clientCursor = cursorFor.get(`${organizationId}:${embeddedProduct}`);
      // No declared view for this embedded product, or no baseline yet.
      if (clientCursor === undefined || clientCursor === 0) continue;

      const frontier = frontiers[embeddedProduct] ?? 0;
      if (frontier <= clientCursor) continue;

      const readFilter = resolveCollectionReadFilter(access, embeddedProduct, organizationId);
      const readWhere = buildCollectionReadWhere(readFilter, getEntityTable(embeddedProduct), access);
      if (readWhere.kind === 'none') continue;

      const { updatedIds, deletedIds, untilSeq } = await tenantReadAsIncludingDeleted(ctx, tenantId, (readCtx) =>
        findChangedEntityDeltaIds(readCtx, {
          entityType: embeddedProduct,
          organizationId,
          afterSeq: clientCursor,
          readWhere: readWhere.kind === 'where' ? readWhere.where : undefined,
          limit: maxHintRows + 1,
        }),
      );
      // No changed row the caller may read.
      if (untilSeq === null) continue;

      if (updatedIds.length + deletedIds.length > maxHintRows) hints.push({ embeddedProduct, update: [], remove: [], overflow: true, untilSeq });
      else hints.push({ embeddedProduct, update: updatedIds, remove: deletedIds, untilSeq });
    }

    if (hints.length > 0) {
      scope.propagation = hints;
    }
  }
}
