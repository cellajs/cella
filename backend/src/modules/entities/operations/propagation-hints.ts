import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import { findChangedEntityDeltaIds } from '#/modules/entities/entities-queries';
import { accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import type { CatchupOrganizationSummary, CatchupView, StreamCatchupResponse } from '#/schemas';
import { getEntityTable } from '#/tables';

/** The product types productEmbeddings config embeds in a host, each once however many hosts embed it. */
const embeddedProductTypes = new Set(appConfig.productEmbeddings.map(({ embeddedProductType }) => embeddedProductType));

/** The most changed rows one hint names, as many as one range read returns: past it the hint names none, and the client refetches the host lists. */
export const maxHintRows = 1000;

/**
 * An embedded product changed when the org's `e:f:{embeddedProductType}` frontier exceeds the client's org-view cursor:
 * the organization gets one hint for it. The ids come from a delta read in the caller's tenant that keeps the rows the
 * caller may read, as a list does, so a hint names no row the caller cannot fetch; tombstones return as removal hints.
 * @param orgCounters - The parsed counter row of each organization in `organizations`.
 */
export async function buildPropagationHints(
  ctx: UserContext,
  organizations: StreamCatchupResponse['organizations'],
  views: CatchupView[],
  orgCounters: Map<string, { frontiers: Record<string, number> }>,
): Promise<void> {
  if (embeddedProductTypes.size === 0 || views.length === 0) return;
  const { memberships } = ctx.var;
  const access = accessFrom(ctx);
  const tenantByOrganization = new Map(memberships.map((membership) => [membership.organizationId, membership.tenantId]));

  // Org-view cursors per (org, embeddedProductType).
  const cursorFor = new Map<string, number>();
  for (const { organizationId, productType, cursor } of views) {
    const key = `${organizationId}:${productType}`;
    cursorFor.set(key, Math.min(cursorFor.get(key) ?? Number.POSITIVE_INFINITY, cursor));
  }

  for (const [organizationId, scope] of Object.entries(organizations)) {
    // Without a membership in the organization the caller has no tenant there and reads nothing.
    const tenantId = tenantByOrganization.get(organizationId);
    if (!tenantId) continue;

    const hints: CatchupOrganizationSummary['propagation'] = [];
    const frontiers = orgCounters.get(organizationId)?.frontiers ?? {};

    for (const embeddedProductType of embeddedProductTypes) {
      const clientCursor = cursorFor.get(`${organizationId}:${embeddedProductType}`);
      // No declared view for this embedded product, or no baseline yet.
      if (clientCursor === undefined || clientCursor === 0) continue;

      const frontier = frontiers[embeddedProductType] ?? 0;
      if (frontier <= clientCursor) continue;

      const readFilter = resolveCollectionReadFilter(access, embeddedProductType, organizationId);
      const readWhere = buildCollectionReadWhere(readFilter, getEntityTable(embeddedProductType), access);
      if (readWhere.kind === 'none') continue;

      const { updatedIds, deletedIds, untilSeq } = await tenantRead(
        ctx,
        (readCtx) =>
          findChangedEntityDeltaIds(readCtx, {
            entityType: embeddedProductType,
            organizationId,
            afterSeq: clientCursor,
            readWhere: readWhere.kind === 'where' ? readWhere.where : undefined,
            limit: maxHintRows + 1,
          }),
        { tenantId, includeDeleted: true },
      );
      // No changed row the caller may read.
      if (untilSeq === null) continue;

      if (updatedIds.length + deletedIds.length > maxHintRows) hints.push({ embeddedProductType, update: [], remove: [], overflow: true, untilSeq });
      else hints.push({ embeddedProductType, update: updatedIds, remove: deletedIds, untilSeq });
    }

    if (hints.length > 0) scope.propagation = hints;
  }
}
