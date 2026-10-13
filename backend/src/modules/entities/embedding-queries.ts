import { sql } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { draftVisibleRowsPredicate } from '#/db/utils/published-predicate';
import { requestScope } from '#/db/utils/request-scope';
import { getEntityTable } from '#/tables';

interface FilterExistingProductIdsOpts {
  entityType: ProductEntityType;
  ids: string[];
}

/**
 * Out of `ids`, the ones that name a live row of `entityType` in the request's tenant and organization, in the order
 * given: what a host row may store in an id array column (`appConfig.productEmbeddings`). An unknown, deleted or
 * out-of-scope id is left out, and so is a draft that does not show to the caller, so a host names no row its
 * organization does not hold. Runs on the connection it is handed: a host write calls it inside its tenant transaction.
 */
export const filterExistingProductIds = async (ctx: ActorContext, { entityType, ids }: FilterExistingProductIdsOpts) => {
  if (ids.length === 0) return [];
  const { tenantId, organizationId } = requestScope(ctx, entityType);
  const table = getEntityTable(entityType);
  const drafts = draftVisibleRowsPredicate(table, ctx.var.actor.id);

  const result = await ctx.var.db.execute<{ id: string }>(sql`
    SELECT id FROM ${table}
    WHERE id IN (${sql.join(ids, sql`, `)}) AND tenant_id = ${tenantId} AND organization_id = ${organizationId}
      AND deleted_at IS NULL${drafts ? sql` AND ${drafts}` : sql``}
  `);
  const found = new Set(result.rows.map((row) => row.id));
  return ids.filter((id) => found.has(id));
};
