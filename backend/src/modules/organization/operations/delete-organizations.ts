import type { UserContext } from '#/core/context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteOrganizationsByIds } from '#/modules/organization/organization-queries';
import { splitByPermission } from '#/permissions/split-by-permission';
import { log } from '#/utils/logger';

export async function deleteOrganizationsOp(ctx: UserContext, ids: string[], tenantId: string) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'organization', toDeleteIds);

  const deleted = await deleteOrganizationsByIds(ctx, { ids: allowedIds });
  // Once the rows are gone, so a handler that deletes outside the database never acts on a delete that failed.
  await dispatchMutation(ctx, 'organization.deleted', { before: deleted });

  for (const id of allowedIds) invalidateCache.org(tenantId, id);

  log.info('Organizations deleted', { count: allowedIds.length, ids: allowedIds });

  return { data: [], rejectedIds };
}
